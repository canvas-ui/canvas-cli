'use strict';

import { input, password, select } from '../../../core/prompt.js';
import { CanvasError, UsageError } from '../../../core/errors.js';
import { parseRemoteIdentifier } from '../../../core/transport/address.js';
import { ensureDeviceRegistered } from '../../../core/device-registration.js';

/** Servers answer with an envelope or a bare array depending on client mode. */
export function unwrap(res) {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.payload)) return res.payload;
    if (Array.isArray(res?.documents)) return res.documents;
    return res?.payload ?? res;
}

const NEW_HUB = Symbol('new-hub');

/**
 * The hub for a mirror: `--hub`, else the bound remote, else a choice. In the
 * wizard (`allowLogin`) the choice includes "log in to another hub", and a
 * device with no remotes at all goes straight to the login prompts.
 */
export async function resolveHub(flags, client, session, { interactive = true, allowLogin = false, io } = {}) {
    if (flags.hub) {
        if (!client.getRemote(flags.hub)) throw new UsageError(`Unknown remote '${flags.hub}' — add it with \`canvas remote add\``);
        return flags.hub;
    }
    if (flags['hub-url']) return loginToHub(client, session, io, { url: flags['hub-url'], email: flags.email, password: flags.password, name: flags['hub-name'] });
    const ids = Object.keys(client.remotes());
    if (ids.length === 0) {
        if (allowLogin && interactive) return loginToHub(client, session, io, {});
        throw new CanvasError('No remotes configured. Run `canvas remote add <user@name> <url>` first.');
    }
    const bound = session.boundRemote();
    if (!allowLogin) {
        if (bound && client.getRemote(bound)) return bound;
        if (ids.length === 1 || !interactive) return ids[0];
    } else if (!interactive) {
        return bound && client.getRemote(bound) ? bound : ids[0];
    }
    const options = ids.map((id) => ({ label: `${id}  (${client.getRemote(id)?.url || '?'})${id === bound ? '  [current]' : ''}`, value: id }));
    if (allowLogin) options.push({ label: 'log in to another Canvas server…', value: NEW_HUB });
    // Current remote first so an empty answer keeps it.
    options.sort((a, b) => (a.value === bound ? -1 : b.value === bound ? 1 : 0));
    const picked = await select('Which Canvas server (hub) should this device sync with?', options);
    return picked === NEW_HUB ? loginToHub(client, session, io, {}) : picked;
}

/**
 * First contact with a hub from inside the wizard: URL + e-mail/password →
 * remote entry (`<user>@<name>`), JWT, device registration. Returns the remote
 * id. Any missing piece is prompted for; `--yes` runs need all of them as flags.
 */
export async function loginToHub(client, session, io, { url, email, password: pw, name }) {
    if (!url) url = (await input('Canvas server URL (e.g. https://canvas.example.org): ')).trim();
    if (!url) throw new UsageError('Hub URL required');
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    let parsed;
    try { parsed = new URL(url); } catch { throw new UsageError(`Invalid URL: ${url}`); }
    url = url.replace(/\/+$/, '');

    if (!email) email = (await input('Email: ')).trim();
    if (!email) throw new UsageError('Email required');
    if (!pw) pw = await password('Password: ');
    if (!pw) throw new UsageError('Password required');

    if (!name) {
        const suggested = suggestHubName(parsed);
        name = (await input(`Short name for this server [${suggested}]: `)).trim() || suggested;
    }
    const user = email.split('@')[0].replace(/[^a-z0-9._-]/gi, '') || 'user';
    const remoteId = `${user}@${name}`;
    if (!parseRemoteIdentifier(remoteId)) throw new UsageError(`Cannot build a remote id from '${email}' and '${name}'`);
    if (client.getRemote(remoteId)) {
        const existing = client.getRemote(remoteId);
        if (existing.url.replace(/\/+$/, '') !== url) throw new CanvasError(`Remote '${remoteId}' already points at ${existing.url}; pick another name`);
        io?.info(`Remote '${remoteId}' exists — refreshing its login`);
    } else {
        client.saveRemote(remoteId, { url, apiBase: '/rest/v2', version: null, auth: { method: 'password', tokenType: 'jwt', token: '' } });
    }

    client.clearCache(remoteId);
    let result;
    try {
        result = await client.client(remoteId).auth.login({ email, password: pw });
    } catch (e) {
        throw new CanvasError(`Login to ${url} failed: ${e.message}`);
    }
    const token = result?.token;
    if (!token) throw new CanvasError('Login response missing token');
    client.updateRemote(remoteId, { auth: { method: 'token', tokenType: 'jwt', token } });
    try {
        const info = await client.client(remoteId).ping();
        if (info?.version) client.updateRemote(remoteId, { version: info.version });
    } catch { /* version is cosmetic */ }
    io?.success(`Logged in to ${url} as ${result?.user?.name || result?.user?.email || email} (remote '${remoteId}')`);

    if (!session.boundRemote() || !client.getRemote(session.boundRemote())) {
        session.bindRemote(remoteId);
        session.update({ boundRemoteStatus: 'connected' });
        io?.info(`'${remoteId}' is now the default remote`);
    }
    try {
        await ensureDeviceRegistered(remoteId, client, io);
    } catch (e) {
        io?.warn(`Device registration skipped: ${e.message}`);
    }
    return remoteId;
}

function suggestHubName(parsed) {
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'localhost' || host === '127.0.0.1') return 'local';
    const label = host.split('.')[0].replace(/[^a-z0-9-]/gi, '');
    return label || 'hub';
}

export async function listHubWorkspaces(client, remoteId) {
    const rc = client.client(remoteId);
    const list = unwrap(await rc.workspaces.list());
    return (Array.isArray(list) ? list : []).map((w) => ({
        id: w.id,
        name: w.name,
        label: w.label || w.name,
        // Case-preserving folder name (server ≥ 2.8.2); older hubs: the label
        // when it is just the cased name, else the lowercase name.
        folderName: w.folderName || (w.rootPath ? w.rootPath.split(/[\\/]/).pop() : null)
            || (hubWorkspaceName(w.label || '').toLowerCase() === w.name ? hubWorkspaceName(w.label) : w.name),
        status: w.status,
        origin: w.origin,
    })).filter((w) => w.name);
}

/** Match a user-typed name/id against the hub list (names are case-insensitive on the hub). */
export function findHubWorkspace(list, ref) {
    const needle = String(ref || '').trim();
    const lower = needle.toLowerCase();
    return list.find((w) => w.id === needle)
        || list.find((w) => w.name === lower)
        || list.find((w) => (w.folderName || '').toLowerCase() === lower)
        || list.find((w) => (w.label || '').toLowerCase() === lower)
        || null;
}

/** Create a workspace on the hub for a folder we are about to publish. */
export async function createHubWorkspace(client, remoteId, { name, label, description }) {
    const rc = client.client(remoteId);
    const res = await rc.workspaces.create({ name, label: label || name, description: description || '', type: 'workspace' });
    const ws = res?.payload ?? res;
    if (!ws?.id) throw new CanvasError(`Hub did not return the created workspace '${name}'`);
    return { id: ws.id, name: ws.name || name, label: ws.label || label || name, status: ws.status };
}

/**
 * What the hub will accept as a workspace name: it keeps the case for the
 * folder (and label) and lowercases a copy as the identity; everything
 * outside [A-Za-z0-9-_] is dropped. Spaces and dots become dashes here so
 * "My Notes" publishes as "My-Notes" rather than "MyNotes".
 */
export function hubWorkspaceName(name) {
    return String(name || '').trim().replace(/[\s.]+/g, '-').replace(/[^A-Za-z0-9-_]/g, '').replace(/^-+|-+$/g, '');
}

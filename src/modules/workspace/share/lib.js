'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CANVAS_HOME, DIR_CONFIG } from '../../../core/paths.js';
import { JsonFile } from '../../../core/storage.js';
import { UsageError } from '../../../core/errors.js';
import { createTlsTransport } from '@augmentd-labs/canvas-api-client/tls';
import { ensureDeviceRegistered } from '@augmentd-labs/canvas-cli-host/device-registration';
import { edgeStatus } from '../../mirror/lib/edge.js';

/*
 * Shares this machine serves: local folders a workspace lists and reads in
 * place. The canvas-edge daemon reads this file (its share units); the CLI
 * writes it. Entry: { id, remote, workspaceName, name, label, mode, path, watch,
 * exclude, stateDir?, paused?, createdAt }.
 */
export const FILE_SHARES = path.join(DIR_CONFIG, 'shares.json');
const store = new JsonFile(FILE_SHARES, { version: 1, shares: [] });

export const SHARE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function readShares() {
    const data = store.read();
    return Array.isArray(data?.shares) ? data.shares : [];
}

function writeShares(shares) { store.write({ version: 1, shares }); }

/** `<remote>/<workspace>/<name>`: one share name per workspace per hub. */
export function shareId(remoteId, workspaceName, name) { return `${remoteId}/${workspaceName}/${name}`; }

export function findShare(remoteId, workspaceName, name) {
    return readShares().find((s) => s.id === shareId(remoteId, workspaceName, name)) || null;
}

export function upsertShare(share) {
    writeShares([...readShares().filter((s) => s.id !== share.id), share]);
    return share;
}

export function removeShare(id) {
    const shares = readShares();
    writeShares(shares.filter((s) => s.id !== id));
    return shares.some((s) => s.id === id);
}

/** Where the daemon keeps a share's index: the entry's own `stateDir`, else its default under ~/.canvas/var/shares. */
export function shareStateDir(share) {
    return share.stateDir ? path.resolve(String(share.stateDir)) : path.join(CANVAS_HOME, 'var', 'shares', String(share.id).replace(/[^a-zA-Z0-9._@-]+/g, '_'));
}

export function assertShareName(name) {
    if (!SHARE_NAME.test(String(name || ''))) {
        throw new UsageError(`Share name must be <share>.<site> in lowercase letters, digits and dashes, e.g. --name nas-accounting.home (got "${name ?? ''}")`);
    }
    return name;
}

/** The folder as an absolute real path; it has to exist and be a directory. */
export function resolveFolder(folder) {
    const abs = path.resolve(String(folder).replace(/^~(?=$|\/)/, os.homedir()));
    let real;
    try { real = fs.realpathSync(abs); } catch { throw new UsageError(`Folder not found: ${abs}`); }
    if (!fs.statSync(real).isDirectory()) throw new UsageError(`Not a folder: ${real}`);
    return real;
}

/**
 * The daemon serves a share under this device's token. Make sure the remote
 * has one the hub still accepts: a token the hub no longer knows (the device
 * was removed there, the hub was reinstalled) is replaced by registering again.
 */
export async function ensureDeviceToken(client, remoteId, workspace, io) {
    const remote = client.getRemote(remoteId);
    if (!remote?.device?.token) { await ensureDeviceRegistered(remoteId, client, io); return; }
    const transport = createTlsTransport(remote.url, remote.tls);
    let status;
    try {
        const res = await transport.fetch(`${remote.url}${remote.apiBase || '/rest/v2'}/workspaces/${encodeURIComponent(workspace)}/backends/share`, {
            headers: { authorization: `Bearer ${remote.device.token}` }, signal: AbortSignal.timeout(10000),
        });
        status = res.status;
    } catch { return; } finally { await transport.dispose?.(); }
    if (status !== 401) return;
    io.warn('The hub no longer accepts this device\'s token; registering the device again.');
    await ensureDeviceRegistered(remoteId, client, io, { force: true });
}

/** The daemon's view of one share unit once it has checked in or failed to, or null when it does not answer. */
export async function waitForShare(id, { timeout = 15000 } = {}) {
    let unit = null;
    for (const end = Date.now() + timeout; Date.now() < end;) {
        unit = await edgeStatus().then((s) => (s?.mirrors || []).find((u) => u.unit === 'share' && u.id === id) || null).catch(() => null);
        if (unit?.connected || unit?.lastError || unit?.state === 'unavailable') return unit;
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return unit;
}

/** `name`, or the one share this machine serves to the workspace when none is given. */
export function pickShare(remoteId, workspaceName, name) {
    if (name) return findShare(remoteId, workspaceName, name);
    const mine = readShares().filter((s) => s.remote === remoteId && s.workspaceName === workspaceName);
    if (mine.length === 1) return mine[0];
    throw new UsageError(mine.length ? `Share name required; this machine serves ${mine.map((s) => s.name).join(', ')}` : 'This machine serves no share of this workspace');
}

'use strict';

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { input, intro, log, multiSelect, note, outro, select, spinner, yesNo } from '../../../core/prompt.js';
import { UsageError } from '../../../core/errors.js';
import { ensureDeviceRegistered } from '../../../core/device-registration.js';
import { CLIENTS, CONFLICT_MODES, DELETE_MODES, buildMirror, defaultRoot, findMirror, flagOff, listMirrors, parseWorkspaceSpec, readConfig, setRoot, splitList, upsertMirror, noStart } from '../lib/config.js';
import { ensurePM2 } from '../lib/pm2.js';
import { findHubWorkspace, listHubWorkspaces, resolveHub } from '../lib/hub.js';
import { configurePublishedMirror, ensureHubWorkspace, inspectFolder, parsePublishSpec } from '../lib/publish.js';
import { startMirrors } from '../lib/lifecycle.js';
import { ensureEdge } from '../lib/edge.js';

/*
 * First run on a device (and re-runnable later):
 *   1. hub — pick a configured remote or log in to a new server
 *   2. mirror root (default ~/Workspaces)
 *   3. what to sync:
 *        mirror   — workspaces from the hub as local folders (multi-select)
 *        publish  — local folders that become new hub workspaces, synced in place
 *      the client (fuse / daemon) is chosen before the workspaces, so the
 *      offline/selective-folder question can be phrased for it
 *   4. conflicts, supervision (pm2 is checked — and offered — before anything is written)
 *   5. start; on a re-run, existing mirrors can be restarted as well
 * Every prompt has a flag so the same setup can be scripted with --yes.
 */
export default {
    name: 'init',
    description: 'Set up this device: log in, mirror hub workspaces and/or publish local folders',
    flags: {
        hub: 'string',
        'hub-url': 'string',   // log in to a new server non-interactively (with --email/--password)
        'hub-name': 'string',
        email: 'string',
        password: 'string',
        root: 'string',
        workspace: 'string',   // name[:sub/,sub2/], comma-separated — remote workspaces to mirror here
        publish: 'string',     // folder[:name], comma-separated — local folders to publish
        attach: 'boolean',     // publish into a same-named hub workspace if it already exists
        conflicts: 'string',   // prompt | rename
        deletes: 'string',     // propagate | keep
        client: 'string',      // fuse (default on Linux) | daemon (real folder via canvas-edge)
        service: 'boolean',    // --service: pm2 processes; --no-service: detached starts
        restart: 'boolean',    // also restart mirrors that were configured earlier
        'no-start': 'boolean',
        yes: 'boolean',
    },
    async run({ flags, client, session, io }) {
        const interactive = !flags.yes;
        intro('Canvas mirror setup');

        // 0. Re-run: what to do with what is already here
        const existing = listMirrors();
        let action = 'add';
        if (existing.length) {
            note(existing.map((m) => `${m.workspaceName.padEnd(18)} ${m.client === 'daemon' ? 'daemon' : 'fuse  '}  ${m.managed === 'pm2' ? 'pm2   ' : 'manual'}  ${m.mountpoint}`).join('\n'), `${existing.length} mirror(s) already configured on this device`);
            if (flags.restart) action = flags.workspace || flags.publish ? 'both' : 'restart';
            else if (interactive) {
                action = await select('What would you like to do?', [
                    { label: 'Add more', value: 'add', hint: 'mirror other workspaces or publish folders' },
                    { label: 'Restart the existing mirrors', value: 'restart', hint: 'stop + start everything configured' },
                    { label: 'Both', value: 'both' },
                ]);
            }
        }

        const configured = [];
        if (action !== 'restart') {
            // 1. Hub
            const remoteId = await resolveHub(flags, client, session, { interactive, allowLogin: true, io });
            log.step(`Hub: ${remoteId} (${client.getRemote(remoteId)?.url || '?'})`);
            try {
                await ensureDeviceRegistered(remoteId, client, io);
            } catch (e) {
                log.warn(`Device registration skipped: ${e.message}`);
            }

            // 2. Mirror root
            let root = flags.root || readConfig().root || null;
            if (!root && interactive) {
                root = await input({ message: 'Where should mirrored workspaces live?', defaultValue: defaultRoot(), placeholder: defaultRoot() });
            }
            root = path.resolve((root || defaultRoot()).replace(/^~(?=$|[\\/])/, os.homedir()));
            if (!existsSync(root)) mkdirSync(root, { recursive: true });
            setRoot(root);

            // 3. What to sync
            let mode;
            if (flags.workspace || flags.publish) mode = flags.workspace && flags.publish ? 'both' : flags.workspace ? 'mirror' : 'publish';
            else if (interactive) {
                mode = await select('What do you want to set up?', [
                    { label: 'Mirror workspaces from the hub', value: 'mirror', hint: `as folders under ${root}` },
                    { label: 'Publish local folders as new workspaces', value: 'publish', hint: 'synced in place' },
                    { label: 'Both', value: 'both' },
                ]);
            } else mode = 'mirror';

            // 4. Behaviour (asked once, applies to everything configured in this run)
            const { conflicts, deletes } = await pickModes(flags, interactive);
            const managed = (await pickSupervision(flags, interactive, io)) ? 'pm2' : 'manual';

            if (mode === 'mirror' || mode === 'both') {
                configured.push(...await setupMirrors({ flags, interactive, client, remoteId, root, conflicts, deletes, managed }));
            }
            if (mode === 'publish' || mode === 'both') {
                configured.push(...await setupPublishes({ flags, interactive, client, remoteId, root, conflicts, deletes, managed, io }));
            }
            if (configured.length === 0 && action === 'add') { outro('Nothing configured.'); return; }
            if (configured.length) log.success(`${configured.length} mirror(s) written to mirrors.json`);
        }
        if (noStart(flags)) { outro('Configured (not started). `canvas mirror start all` when ready.'); return; }

        // 5. Start (messages go through the wizard's gutter, not the table io)
        const wio = { success: log.success, error: log.error, warn: log.warn, info: log.info };
        const results = [];
        if (configured.length) results.push(...await startMirrors(configured, wio));
        if (action !== 'add') {
            const ids = new Set(configured.map((m) => m.id));
            const older = listMirrors().filter((m) => !ids.has(m.id));
            if (older.some((m) => m.client === 'daemon')) await ensureEdge({ interactive, io: wio });
            if (older.length) results.push(...await startMirrors(older, wio, { restart: true }));
        }
        const failed = results.filter((r) => !r.ok);
        if (failed.length) outro(`${failed.length} of ${results.length} mirror(s) did not start — fix the cause above, then \`canvas mirror start all\`.`);
        else outro('Check progress with `canvas mirror status`; conflicts show up in Workspace › Settings › Sync.');
    },
};

async function pickModes(flags, interactive) {
    let conflicts = flags.conflicts;
    if (!conflicts && interactive) {
        conflicts = await select('When a file changed here AND on the hub:', [
            { label: 'Keep the hub version, park mine in the hub inbox', value: 'prompt', hint: 'decide later in the web UI (recommended)' },
            { label: 'Keep both', value: 'rename', hint: 'mine becomes "name (conflict from <device> <date>)"' },
        ]);
    }
    conflicts = conflicts || 'prompt';
    if (!CONFLICT_MODES.includes(conflicts)) throw new UsageError(`--conflicts must be ${CONFLICT_MODES.join('|')}`);
    const deletes = flags.deletes || 'propagate';
    if (!DELETE_MODES.includes(deletes)) throw new UsageError(`--deletes must be ${DELETE_MODES.join('|')}`);
    return { conflicts, deletes };
}

/**
 * pm2 or not — settled before any config is written. `--service` needs pm2
 * (installed on the spot when interactive); `--no-service` skips the question.
 */
async function pickSupervision(flags, interactive, io) {
    if (flagOff('service') || noStart(flags)) return false;
    if (flags.service) {
        if (await ensurePM2({ interactive, io })) return true;
        if (!interactive) throw new UsageError('--service needs pm2 (`npm install -g pm2`), or pass --no-service');
        log.warn('Continuing without pm2 — mirrors start detached and do not survive a reboot.');
        return false;
    }
    if (!interactive) return false;
    if (!(await yesNo('Keep the sync running as a service (start at login, restart on crash)?', true))) return false;
    if (await ensurePM2({ interactive: true, io })) return true;
    log.warn('Continuing without pm2 — mirrors start detached and do not survive a reboot.');
    return false;
}

/** Remote workspaces → local folders under the root. */
async function setupMirrors({ flags, interactive, client, remoteId, root, conflicts, deletes, managed }) {
    const s = spinner();
    s.start(`Listing workspaces on ${remoteId}…`);
    let available;
    try { available = await listHubWorkspaces(client, remoteId); } finally { s.stop(`Workspaces on ${remoteId}`); }
    if (available.length === 0) { log.warn(`No workspaces on ${remoteId} yet.`); return []; }
    const already = new Set(listMirrors().filter((m) => m.remote === remoteId).map((m) => m.workspaceName));

    // Client first: it decides what the folder question below means.
    let mirrorClient = flags.client;
    if (!mirrorClient && interactive) {
        const fuseOpt = { label: 'FUSE mount', value: 'fuse', hint: 'everything visible, chosen folders offline, the rest on demand (Linux)' };
        const daemonOpt = { label: 'Real folder', value: 'daemon', hint: 'canvas-edge keeps a full copy in sync (any OS, no FUSE)' };
        mirrorClient = await select('How should the folders be provided?', process.platform === 'linux' ? [fuseOpt, daemonOpt] : [daemonOpt, fuseOpt]);
    }
    mirrorClient = mirrorClient || (process.platform === 'linux' ? 'fuse' : 'daemon');
    if (!CLIENTS.includes(mirrorClient)) throw new UsageError(`--client must be ${CLIENTS.join('|')}`);
    if (mirrorClient === 'daemon' && !(await ensureEdge({ interactive, io: log }))) {
        log.warn('canvas-edge is missing — folders are configured but will only sync once it is installed.');
    }

    let chosen = [];
    if (flags.workspace) {
        for (const spec of splitList(flags.workspace)) {
            const { name, pins } = parseWorkspaceSpec(spec);
            const ws = findHubWorkspace(available, name);
            if (!ws) throw new UsageError(`Workspace '${name}' not found on ${remoteId}`);
            chosen.push({ ws, pins });
        }
    } else if (interactive) {
        const options = available.filter((ws) => !already.has(ws.name)).map((ws) => ({
            label: ws.folderName,
            value: ws,
            hint: `${ws.label && ws.label !== ws.folderName ? `${ws.label} · ` : ''}${path.join(root, ws.folderName)}`,
        }));
        if (options.length === 0) { log.info(`Every workspace on ${remoteId} is already mirrored here.`); return []; }
        const picked = await multiSelect(`Workspaces to mirror on this device (${available.length - options.length} already mirrored)`, options);
        chosen = picked.map((ws) => ({ ws, pins: [] }));
        if (chosen.length) await askPins(chosen, mirrorClient);
    } else {
        chosen = available.filter((ws) => !already.has(ws.name)).map((ws) => ({ ws, pins: [] }));
    }
    if (chosen.length === 0) return [];

    const out = [];
    for (const { ws, pins } of chosen) {
        if (findMirror(`${remoteId}/${ws.name}`)) { log.info(`${ws.name}: already mirrored, skipping`); continue; }
        const target = path.join(root, ws.folderName);
        // A FUSE mount hides whatever the mountpoint holds; a daemon folder merges (local files are pushed as new).
        if (existsSync(target) && readdirSync(target).some((e) => e !== '.workspace')) {
            if (mirrorClient === 'fuse') {
                log.warn(`${target} is not empty — a FUSE mount needs an empty mountpoint. Move its contents away, or use the real-folder client (merges the folder into the workspace).`);
                if (interactive && !(await yesNo(`Skip '${ws.name}' for now?`, true))) throw new UsageError(`Empty ${target} first`);
                continue;
            }
            if (interactive && !(await yesNo(`${target} already has files — merge them into '${ws.name}' (they are uploaded, nothing is deleted)?`, true))) continue;
        }
        out.push(upsertMirror(buildMirror({
            remoteId, workspaceId: ws.id, workspaceName: ws.name, folderName: ws.folderName, root, pins, conflicts, deletes, client: mirrorClient, managed,
        })));
        log.success(`${ws.folderName} → ${target}`);
    }
    return out;
}

/**
 * Pins mean "keep offline" on a FUSE mount and "sync only these" for the
 * daemon; one opt-in question, then a line per workspace only if wanted.
 */
async function askPins(chosen, mirrorClient) {
    const question = mirrorClient === 'fuse'
        ? 'Keep some folders available offline? (default: everything on demand)'
        : 'Limit the sync to some folders? (default: the whole workspace)';
    if (!(await yesNo(question, false))) return;
    for (const item of chosen) {
        const raw = await input({
            message: `${item.ws.folderName}: folders, comma-separated`,
            placeholder: mirrorClient === 'fuse' ? 'Docs/, Projects/current/  (empty = on demand)' : 'Docs/, Projects/  (empty = everything)',
        });
        item.pins = raw.trim() ? parseWorkspaceSpec(`${item.ws.name}:${raw}`).pins : [];
    }
}

/** Local folders → new hub workspaces, synced in place by the daemon. */
async function setupPublishes({ flags, interactive, client, remoteId, root, conflicts, deletes, managed, io }) {
    const specs = [];
    if (flags.publish) {
        for (const raw of splitList(flags.publish)) specs.push(parsePublishSpec(raw));
    } else if (interactive) {
        log.message('Folders to publish as workspaces — one per prompt, `folder:name` to pick the name, leave empty to finish.');
        for (;;) {
            const raw = (await input({ message: 'Folder', placeholder: '~/Code/UI  (empty = done)' })).trim();
            if (!raw) break;
            try { specs.push(parsePublishSpec(raw)); } catch (e) { log.warn(e.message); }
        }
    }
    if (specs.length && !(await ensureEdge({ interactive, io: log }))) {
        log.warn('canvas-edge is missing — published folders will only sync once it is installed.');
    }
    const out = [];
    for (const spec of specs) {
        const info = inspectFolder(spec.folder);
        if (!info.exists) { log.warn(`${spec.folder}: does not exist, skipping`); continue; }
        if (info.isWorkspace) { log.warn(`${spec.folder}: already a Canvas workspace (workspace.json), skipping`); continue; }
        if (info.mirrored) { log.info(`${spec.folder}: already mirrored as ${info.mirrored.id}, skipping`); continue; }
        let name = spec.name;
        if (interactive) {
            name = await input({ message: `${spec.folder} (${info.entries} entries) → workspace name`, defaultValue: spec.name, placeholder: spec.name });
        }
        let result;
        try {
            result = await ensureHubWorkspace(client, remoteId, { name, label: name }, { onExisting: flags.attach ? 'attach' : 'fail', io });
        } catch (e) {
            if (!interactive || !/already exists/.test(e.message)) throw e;
            if (!(await yesNo(`Workspace '${name}' already exists on ${remoteId} — sync this folder into it?`, false))) { log.info(`${spec.folder}: skipped`); continue; }
            result = await ensureHubWorkspace(client, remoteId, { name, label: name }, { onExisting: 'attach', io });
        }
        out.push(configurePublishedMirror({ remoteId, ws: result.ws, folder: spec.folder, root, conflicts, deletes, managed }));
        log.success(`${spec.folder} ↔ ${remoteId}/${result.ws.name}`);
    }
    return out;
}

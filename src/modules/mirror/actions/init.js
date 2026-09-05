'use strict';

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { input, multiSelect, select, yesNo } from '../../../core/prompt.js';
import { UsageError } from '../../../core/errors.js';
import { ensureDeviceRegistered } from '../../../core/device-registration.js';
import { CLIENTS, CONFLICT_MODES, DELETE_MODES, buildMirror, defaultRoot, findMirror, listMirrors, parseWorkspaceSpec, readConfig, setRoot, splitList, upsertMirror, noStart } from '../lib/config.js';
import { fuseAvailable, mount } from '../lib/fuse.js';
import { STARTUP_HINT, save, startProcess } from '../lib/pm2.js';
import { findHubWorkspace, listHubWorkspaces, resolveHub } from '../lib/hub.js';
import { configurePublishedMirror, ensureHubWorkspace, inspectFolder, parsePublishSpec } from '../lib/publish.js';
import { ensureEdgeService } from '../lib/edge.js';

/*
 * First run on a device (and re-runnable later):
 *   1. hub — pick a configured remote or log in to a new server
 *   2. mirror root (default ~/Workspaces)
 *   3. what to sync:
 *        mirror   — workspaces from the hub as local folders (multi-select)
 *        publish  — local folders that become new hub workspaces, synced in place
 *   4. conflicts / deletes / client / supervision
 *   5. start
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
        service: 'boolean',    // install pm2 processes instead of detached mounts
        'no-start': 'boolean',
        yes: 'boolean',
    },
    async run({ flags, client, session, io }) {
        const interactive = !flags.yes;
        const existing = listMirrors();
        if (existing.length && interactive) {
            io.info(`This device already mirrors ${existing.length} workspace(s): ${existing.map((m) => m.id).join(', ')}`);
        }

        // 1. Hub
        const remoteId = await resolveHub(flags, client, session, { interactive, allowLogin: true, io });
        io.info(`Hub: ${remoteId} (${client.getRemote(remoteId)?.url || '?'})`);
        try {
            await ensureDeviceRegistered(remoteId, client, io);
        } catch (e) {
            io.warn(`Device registration skipped: ${e.message}`);
        }

        // 2. Mirror root
        let root = flags.root || readConfig().root || null;
        if (!root && interactive) {
            root = (await input(`Where should mirrored workspaces live? [${defaultRoot()}]: `)).trim() || defaultRoot();
        }
        root = path.resolve((root || defaultRoot()).replace(/^~(?=$|[\\/])/, os.homedir()));
        if (!existsSync(root)) mkdirSync(root, { recursive: true });
        setRoot(root);

        // 3. What to sync
        let mode;
        if (flags.workspace || flags.publish) mode = flags.workspace && flags.publish ? 'both' : flags.workspace ? 'mirror' : 'publish';
        else if (interactive) {
            mode = await select('What do you want to set up?', [
                { label: `mirror  — workspaces from ${remoteId} as folders under ${root}`, value: 'mirror' },
                { label: 'publish — local folders that become new workspaces on the hub (synced in place)', value: 'publish' },
                { label: 'both', value: 'both' },
            ]);
        } else mode = 'mirror';

        // 4. Modes (asked once, apply to everything configured in this run)
        const { conflicts, deletes } = await pickModes(flags, interactive);
        const useService = flags.service || (interactive && !noStart(flags)
            ? await yesNo('Run the sync as pm2 services (start at login, restart on crash)?', true)
            : false);
        const managed = useService ? 'pm2' : 'manual';

        const configured = [];
        if (mode === 'mirror' || mode === 'both') {
            configured.push(...await setupMirrors({ flags, interactive, client, remoteId, root, conflicts, deletes, managed, io }));
        }
        if (mode === 'publish' || mode === 'both') {
            configured.push(...await setupPublishes({ flags, interactive, client, remoteId, root, conflicts, deletes, managed, io }));
        }
        if (configured.length === 0) { io.warn('Nothing configured.'); return; }
        io.success(`${configured.length} mirror(s) configured in mirrors.json`);
        if (noStart(flags)) return;

        // 5. Start
        await startAll({ mirrors: configured, useService, io });
        io.print('\nCheck progress with `canvas mirror status`; conflicts show up in Workspace › Settings › Sync.');
    },
};

async function pickModes(flags, interactive) {
    let conflicts = flags.conflicts;
    if (!conflicts && interactive) {
        conflicts = await select('When a file changed here AND on the hub:', [
            { label: 'prompt — keep the hub version here, park mine in the hub inbox, decide in the web UI (recommended)', value: 'prompt' },
            { label: 'rename — keep both, mine as "name (conflict from <device> <date>)" (Dropbox style)', value: 'rename' },
        ]);
    }
    conflicts = conflicts || 'prompt';
    if (!CONFLICT_MODES.includes(conflicts)) throw new UsageError(`--conflicts must be ${CONFLICT_MODES.join('|')}`);
    const deletes = flags.deletes || 'propagate';
    if (!DELETE_MODES.includes(deletes)) throw new UsageError(`--deletes must be ${DELETE_MODES.join('|')}`);
    return { conflicts, deletes };
}

/** Remote workspaces → local folders under the root. */
async function setupMirrors({ flags, interactive, client, remoteId, root, conflicts, deletes, managed, io }) {
    const available = await listHubWorkspaces(client, remoteId);
    if (available.length === 0) { io.warn(`No workspaces on ${remoteId} yet.`); return []; }
    const already = new Set(listMirrors().filter((m) => m.remote === remoteId).map((m) => m.workspaceName));

    let chosen = [];
    if (flags.workspace) {
        for (const spec of splitList(flags.workspace)) {
            const { name, pins } = parseWorkspaceSpec(spec);
            const ws = findHubWorkspace(available, name);
            if (!ws) throw new UsageError(`Workspace '${name}' not found on ${remoteId}`);
            chosen.push({ ws, pins });
        }
    } else if (interactive) {
        const options = available.map((ws) => ({
            label: `${ws.folderName}${ws.label && ws.label !== ws.folderName ? `  (${ws.label})` : ''}${already.has(ws.name) ? '  [already mirrored]' : ''} → ${path.join(root, ws.folderName)}`,
            value: ws,
        }));
        const picked = await multiSelect(`Workspaces on ${remoteId} to mirror here:`, options);
        for (const ws of picked) {
            if (already.has(ws.name)) { io.info(`  ${ws.name}: already mirrored, skipping`); continue; }
            const pinsRaw = (await input(`  ${ws.folderName}: folders to keep offline (comma-separated, empty = everything on demand): `)).trim();
            chosen.push({ ws, pins: pinsRaw ? parseWorkspaceSpec(`${ws.name}:${pinsRaw}`).pins : [] });
        }
    } else {
        chosen = available.filter((ws) => !already.has(ws.name)).map((ws) => ({ ws, pins: [] }));
    }
    if (chosen.length === 0) return [];

    let mirrorClient = flags.client;
    if (!mirrorClient && interactive) {
        mirrorClient = await select('How should the folders be provided?', [
            { label: 'fuse — canvas-fuse mount: everything visible, pinned folders offline, the rest on demand (Linux)', value: 'fuse' },
            { label: 'daemon — canvas-edge keeps a real folder fully synced (any OS, no FUSE)', value: 'daemon' },
        ]);
    }
    mirrorClient = mirrorClient || (process.platform === 'linux' ? 'fuse' : 'daemon');
    if (!CLIENTS.includes(mirrorClient)) throw new UsageError(`--client must be ${CLIENTS.join('|')}`);

    const out = [];
    for (const { ws, pins } of chosen) {
        if (findMirror(`${remoteId}/${ws.name}`)) { io.info(`${ws.name}: already mirrored, skipping`); continue; }
        const target = path.join(root, ws.folderName);
        // A FUSE mount hides whatever the mountpoint holds; a daemon folder merges (local files are pushed as new).
        if (existsSync(target) && readdirSync(target).some((e) => e !== '.workspace')) {
            if (mirrorClient === 'fuse') {
                io.warn(`${target} is not empty — a FUSE mount needs an empty mountpoint. Move its contents away, or use --client daemon (merges the folder into the workspace).`);
                if (interactive && !(await yesNo(`  Skip '${ws.name}' for now?`, true))) throw new UsageError(`Empty ${target} first`);
                continue;
            }
            if (interactive && !(await yesNo(`${target} already has files — merge them into '${ws.name}' (they are uploaded, nothing is deleted)?`, true))) continue;
        }
        out.push(upsertMirror(buildMirror({
            remoteId, workspaceId: ws.id, workspaceName: ws.name, folderName: ws.folderName, root, pins, conflicts, deletes, client: mirrorClient, managed,
        })));
        io.success(`  ${ws.folderName} → ${target}`);
    }
    return out;
}

/** Local folders → new hub workspaces, synced in place by the daemon. */
async function setupPublishes({ flags, interactive, client, remoteId, root, conflicts, deletes, managed, io }) {
    const specs = [];
    if (flags.publish) {
        for (const raw of splitList(flags.publish)) specs.push(parsePublishSpec(raw));
    } else if (interactive) {
        io.print('\nFolders to publish as workspaces (one per line, `folder:name` to pick the name, empty line to finish):');
        for (;;) {
            const raw = (await input('  folder: ')).trim();
            if (!raw) break;
            try { specs.push(parsePublishSpec(raw)); } catch (e) { io.warn(`  ${e.message}`); }
        }
    }
    const out = [];
    for (const spec of specs) {
        const info = inspectFolder(spec.folder);
        if (!info.exists) { io.warn(`${spec.folder}: does not exist, skipping`); continue; }
        if (info.isWorkspace) { io.warn(`${spec.folder}: already a Canvas workspace (workspace.json), skipping`); continue; }
        if (info.mirrored) { io.info(`${spec.folder}: already mirrored as ${info.mirrored.id}, skipping`); continue; }
        let name = spec.name;
        if (interactive) {
            name = (await input(`  ${spec.folder} (${info.entries} entries) → workspace name [${spec.name}]: `)).trim() || spec.name;
        }
        let result;
        try {
            result = await ensureHubWorkspace(client, remoteId, { name, label: name }, { onExisting: flags.attach ? 'attach' : (interactive ? 'ask' : 'fail'), io });
        } catch (e) {
            if (!interactive || !/already exists/.test(e.message)) throw e;
            if (!(await yesNo(`  Workspace '${name}' already exists on ${remoteId} — sync this folder into it?`, false))) { io.info(`  ${spec.folder}: skipped`); continue; }
            result = await ensureHubWorkspace(client, remoteId, { name, label: name }, { onExisting: 'attach', io });
        }
        out.push(configurePublishedMirror({ remoteId, ws: result.ws, folder: spec.folder, root, conflicts, deletes, managed }));
        io.success(`  ${spec.folder} ↔ ${remoteId}/${result.ws.name}`);
    }
    return out;
}

async function startAll({ mirrors, useService, io }) {
    const daemon = mirrors.filter((m) => m.client === 'daemon');
    const fuse = mirrors.filter((m) => m.client === 'fuse');
    if (daemon.length) {
        // One canvas-edge process serves every daemon mirror; it reads mirrors.json.
        const { started } = await ensureEdgeService(io);
        io.success(`${started ? 'Started' : 'Reloaded'} canvas-edge for ${daemon.length} folder(s)`);
    }
    if (fuse.length) {
        if (!(await fuseAvailable())) {
            io.warn('canvas-fuse binary not found — mirrors are configured but not started. Install canvas-fuse (or set CANVAS_FUSE_BIN) and run `canvas mirror start all`.');
            return;
        }
        for (const mirror of fuse) {
            if (useService) {
                const { name, started } = await startProcess(mirror);
                io.success(`${started ? 'Started' : 'Already running'}: ${name} → ${mirror.mountpoint}`);
            } else {
                const res = await mount(mirror);
                if (res.ok) io.success(`Mounted ${mirror.mountpoint}`);
                else io.error(`Mount failed for ${mirror.workspaceName}: ${res.stderr.trim() || res.stdout.trim()}`);
            }
        }
        if (useService) {
            await save();
            io.info(STARTUP_HINT);
        }
    }
}

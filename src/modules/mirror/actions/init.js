'use strict';

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { input, select, yesNo } from '../../../core/prompt.js';
import { UsageError } from '../../../core/errors.js';
import { ensureDeviceRegistered } from '../../../core/device-registration.js';
import { CONFLICT_MODES, DELETE_MODES, buildMirror, defaultRoot, parseWorkspaceSpec, readConfig, setRoot, splitList, upsertMirror } from '../lib/config.js';
import { fuseAvailable, mount } from '../lib/fuse.js';
import { STARTUP_HINT, save, startProcess } from '../lib/pm2.js';
import { listHubWorkspaces, resolveHub } from '../lib/hub.js';

/*
 * First run on a device: log in to a hub, pick where mirrored workspaces live
 * (default ~/Workspaces), pick the workspaces (and optionally the folders to
 * keep offline), pick how conflicts are handled, then start the mounts —
 * detached now, or as pm2 services that come back at login. Every prompt has
 * a flag so the same setup can be scripted.
 */
export default {
    name: 'init',
    description: 'Set up this device to mirror workspaces from a hub',
    flags: {
        hub: 'string',
        root: 'string',
        workspace: 'string',   // name[:sub/,sub2/], comma-separated for several
        conflicts: 'string',   // prompt | rename
        deletes: 'string',     // propagate | keep
        service: 'boolean',    // install pm2 processes instead of detached mounts
        'no-start': 'boolean',
        yes: 'boolean',
    },
    async run({ flags, client, session, io }) {
        const interactive = !flags.yes;
        const remoteId = await resolveHub(flags, client, session, { interactive });
        io.info(`Hub: ${remoteId} (${client.getRemote(remoteId)?.url || '?'})`);
        try {
            await ensureDeviceRegistered(remoteId, client, io);
        } catch (e) {
            io.warn(`Device registration skipped: ${e.message}`);
        }

        // Mirror root
        let root = flags.root || readConfig().root || null;
        if (!root && interactive) {
            root = (await input(`Mirror root [${defaultRoot()}]: `)).trim() || defaultRoot();
        }
        root = path.resolve(root || defaultRoot());
        if (!existsSync(root)) mkdirSync(root, { recursive: true });
        setRoot(root);

        // Workspaces
        const available = await listHubWorkspaces(client, remoteId);
        if (available.length === 0) throw new UsageError(`No workspaces on ${remoteId}`);
        let chosen = [];
        if (flags.workspace) {
            for (const spec of splitList(flags.workspace)) {
                const { name, pins } = parseWorkspaceSpec(spec);
                const ws = available.find((w) => w.name === name || w.id === name);
                if (!ws) throw new UsageError(`Workspace '${name}' not found on ${remoteId}`);
                chosen.push({ ws, pins });
            }
        } else if (interactive) {
            io.print(`\nWorkspaces on ${remoteId}:`);
            for (const ws of available) {
                if (await yesNo(`  Mirror '${ws.name}' into ${path.join(root, ws.name)}?`, false)) {
                    const pinsRaw = (await input('    Folders to keep offline (comma-separated, empty = everything on demand): ')).trim();
                    chosen.push({ ws, pins: pinsRaw ? parseWorkspaceSpec(`${ws.name}:${pinsRaw}`).pins : [] });
                }
            }
        } else {
            chosen = available.map((ws) => ({ ws, pins: [] }));
        }
        if (chosen.length === 0) { io.warn('Nothing selected.'); return; }

        // Modes
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

        const useService = flags.service || (interactive && !flags['no-start']
            ? await yesNo('Run the mirrors as pm2 services (start at login, restart on crash)?', true)
            : false);

        const mirrors = chosen.map(({ ws, pins }) => upsertMirror(buildMirror({
            remoteId, workspaceId: ws.id, workspaceName: ws.name, root, pins, conflicts, deletes,
            managed: useService ? 'pm2' : 'manual',
        })));
        io.success(`${mirrors.length} mirror(s) configured in mirrors.json`);

        if (flags['no-start']) return;
        if (!(await fuseAvailable())) {
            io.warn('canvas-fuse binary not found — mirrors are configured but not started. Install canvas-fuse (or set CANVAS_FUSE_BIN) and run `canvas mirror start all`.');
            return;
        }
        for (const mirror of mirrors) {
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
        io.print('\nCheck progress with `canvas mirror status`; conflicts show up in Workspace › Settings › Sync.');
    },
};

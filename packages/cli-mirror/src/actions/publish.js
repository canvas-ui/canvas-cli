'use strict';

import { UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { yesNo } from '@augmentd-labs/canvas-cli-host/prompt';
import { CONFLICT_MODES, DELETE_MODES, readConfig, splitList, noStart } from '../lib/config.js';
import { resolveHub } from '../lib/hub.js';
import { configurePublishedMirror, ensureHubWorkspace, inspectFolder, parsePublishSpec } from '../lib/publish.js';
import { ensureEdgeService } from '../lib/edge.js';
import { ensurePM2 } from '../lib/pm2.js';

/*
 * `canvas remote mirror publish ~/Code/UI [--name ui]` — the folder becomes a hub
 * workspace and stays in sync in place (daemon client). The scripted
 * counterpart of the wizard's "publish a local folder" branch.
 */
export default {
    name: 'publish',
    description: 'Publish a local folder as a new workspace on the hub and keep it in sync',
    positional: [{ name: 'folder', required: true }],
    flags: { hub: 'string', name: 'string', label: 'string', attach: 'boolean', conflicts: 'string', deletes: 'string', ignore: 'string', service: 'boolean', 'no-start': 'boolean', yes: 'boolean' },
    async run({ args, flags, client, session, io }) {
        const interactive = !flags.yes;
        const spec = parsePublishSpec(flags.name ? `${args.folder}:${flags.name}` : args.folder);
        const info = inspectFolder(spec.folder);
        if (!info.exists) throw new UsageError(`${spec.folder} does not exist`);
        if (info.isWorkspace) throw new UsageError(`${spec.folder} already is a Canvas workspace (workspace.json) — a runtime, not a mirror. Move the files into a plain folder first.`);
        if (info.mirrored) throw new UsageError(`${spec.folder} is already mirrored as ${info.mirrored.id}`);

        const remoteId = await resolveHub(flags, client, session, { interactive, io });
        const conflicts = flags.conflicts || 'prompt';
        if (!CONFLICT_MODES.includes(conflicts)) throw new UsageError(`--conflicts must be ${CONFLICT_MODES.join('|')}`);
        const deletes = flags.deletes || 'propagate';
        if (!DELETE_MODES.includes(deletes)) throw new UsageError(`--deletes must be ${DELETE_MODES.join('|')}`);

        let managed = 'manual';
        if (flags.service) {
            if (await ensurePM2({ interactive, io })) managed = 'pm2';
            else if (!interactive) throw new UsageError('--service needs pm2 (`npm install -g pm2`)');
            else io.warn('Continuing without pm2 — canvas-edge starts detached.');
        }
        if (interactive && !(await yesNo(`Publish ${spec.folder} (${info.entries} entries) as workspace '${spec.name}' on ${remoteId}?`, true))) return;
        const { ws, created } = await ensureHubWorkspace(client, remoteId, { name: spec.name, label: flags.label || spec.name }, { onExisting: flags.attach ? 'attach' : 'fail', io });
        const mirror = configurePublishedMirror({
            remoteId, ws, folder: spec.folder, root: readConfig().root || undefined,
            conflicts, deletes, ignore: splitList(flags.ignore), managed,
        });
        io.success(`${created ? 'Publishing' : 'Syncing'} ${mirror.mountpoint} ↔ ${remoteId}/${ws.name}`);
        if (noStart(flags)) return;
        const { started } = await ensureEdgeService(io, { managed });
        io.success(`${started ? 'Started' : 'Reloaded'} canvas-edge — first upload runs in the background (\`canvas remote mirror status\`)`);
    },
};

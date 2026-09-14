'use strict';

import { UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { SUPERVISORS, findMirror, listMirrors, upsertMirror } from '../lib/config.js';
import { unmount } from '../lib/fuse.js';
import { stopProcess } from '../lib/pm2.js';
import { edgeReload } from '../lib/edge.js';
import { startMirrors } from '../lib/lifecycle.js';

/*
 * `canvas remote mirror supervisor <workspace|all> [manual|pm2|edge]` — show or
 * change who keeps a FUSE mount running. `edge` hands it to the canvas-edge
 * daemon as a fuse unit (one process per workspace, restarts, status over the
 * control socket — docs/durable-workspaces.md step 5). Switching stops the
 * mount under the old supervisor and starts it under the new one.
 */
export default {
    name: 'supervisor',
    description: 'Show or set who runs a FUSE mount: manual | pm2 | edge (a canvas-edge fuse unit)',
    positional: [{ name: 'workspace', required: true }, { name: 'supervisor', required: false }],
    flags: { 'no-start': 'boolean' },
    async run({ args, flags, io }) {
        const targets = args.workspace === 'all' ? listMirrors() : [findMirror(args.workspace)].filter(Boolean);
        if (targets.length === 0) throw new UsageError(`No mirror for '${args.workspace}'`);
        if (!args.supervisor) {
            io.table(targets.map((m) => ({ mirror: m.id, client: m.client, supervisor: m.client === 'daemon' ? 'edge' : m.managed, folder: m.mountpoint })));
            return;
        }
        const next = String(args.supervisor).toLowerCase();
        if (!SUPERVISORS.includes(next)) throw new UsageError(`supervisor must be ${SUPERVISORS.join('|')}`);
        const changed = [];
        for (const m of targets) {
            if (m.client === 'daemon') { io.info(`${m.id}: a daemon folder is always run by canvas-edge — skipped`); continue; }
            if (m.managed === next) { io.info(`${m.id}: already ${next}`); continue; }
            // Take it away from the old supervisor first.
            if (m.managed === 'pm2') await stopProcess(m).catch(() => null);
            if (m.managed === 'edge') { upsertMirror({ ...m, paused: true }); await edgeReload().catch(() => null); }
            await unmount(m.mountpoint).catch(() => null);
            changed.push(upsertMirror({ ...m, managed: next, paused: false }));
            io.success(`${m.id}: supervisor ${next}`);
        }
        if (changed.length && !flags['no-start']) await startMirrors(changed, io);
    },
};

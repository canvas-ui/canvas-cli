'use strict';

import { UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { DIRECTIONS, findMirror, listMirrors, upsertMirror } from '../lib/config.js';

/*
 * `canvas remote mirror direction <workspace> [bi|pull|push]` — show or set
 * how a real-folder mirror moves data (canvas-server docs/durable-workspaces.md):
 *   bi    both ways (default)
 *   pull  the hub is the only writer: a backup target. Local edits of tracked
 *         files are parked in .workspace/conflicts and the hub's bytes put
 *         back; local-only files are left alone and reported as skips.
 *   push  local is the only writer: a one-shot import. Hub-side changes are
 *         reported as skips and never applied here.
 * Seeding a NAS: start with `bi`, copy the existing files in, flip to `pull`
 * once the Sync tab shows nothing pending.
 */
export default {
    name: 'direction',
    description: 'Show or set a mirror\'s direction: bi | pull (backup target) | push (one-shot import)',
    positional: [{ name: 'workspace', required: false }, { name: 'direction', required: false }],
    flags: {},
    async run({ args, io }) {
        if (!args.workspace) {
            const rows = listMirrors().map((m) => ({ mirror: m.id, client: m.client, direction: m.direction || 'bi', folder: m.mountpoint }));
            if (rows.length === 0) throw new UsageError('No mirrors configured');
            io.table(rows);
            return;
        }
        const mirror = findMirror(args.workspace);
        if (!mirror) throw new UsageError(`No mirror for '${args.workspace}'`);
        if (!args.direction) { io.info(`${mirror.id}: ${mirror.direction || 'bi'}`); return; }
        const direction = String(args.direction).toLowerCase();
        if (!DIRECTIONS.includes(direction)) throw new UsageError(`direction must be ${DIRECTIONS.join('|')}`);
        if (direction !== 'bi' && mirror.client !== 'daemon') throw new UsageError('a one-way direction needs the daemon client (a FUSE mount is always bi-directional)');
        upsertMirror({ ...mirror, direction });
        io.success(`${mirror.id}: direction ${direction}`);
        io.info(`Restart the mirror to apply: canvas remote mirror restart ${mirror.workspaceName}`);
    },
};

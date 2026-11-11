'use strict';

import { UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { findMirror } from '../lib/config.js';
import { deletes as fuseDeletes } from '../lib/fuse.js';
import { edgeHeldDeletes, edgeSettleDeletes } from '../lib/edge.js';

const VERBS = ['list', 'approve', 'restore'];

/*
 * `canvas remote mirror deletes <workspace> [list|approve|restore]` — a mirror
 * holds a burst of local deletions it only inferred from files being absent
 * (an unmounted drive and a rolled-back folder look the same as `rm -rf`).
 *   list     the files whose deletion is waiting (default)
 *   approve  they were meant: delete them on the hub (they go to its Trash)
 *   restore  they were not: download the hub copies again
 */
export default {
    name: 'deletes',
    description: 'Held local deletions of a mirror: list | approve (delete on the hub) | restore (download again)',
    positional: [{ name: 'workspace', required: true }, { name: 'verb', required: false }],
    async run({ args, io }) {
        const mirror = findMirror(args.workspace);
        if (!mirror) throw new UsageError(`No mirror for '${args.workspace}'`);
        const verb = String(args.verb || 'list').toLowerCase();
        if (!VERBS.includes(verb)) throw new UsageError(`verb must be ${VERBS.join('|')}`);
        if (mirror.client !== 'daemon') {
            const res = await fuseDeletes(mirror.mountpoint, verb);
            const text = (res.stdout || res.stderr).trim();
            if (res.ok) io.info(text || 'No held deletions');
            else io.warn(text || 'canvas-fuse is not running for this mirror');
            return;
        }
        if (verb === 'list') {
            const { held } = await edgeHeldDeletes(mirror.id);
            if (held.length === 0) { io.success('No held deletions'); return; }
            for (const key of held) io.info(key);
            io.info(`${held.length} deletions held. Send them: canvas remote mirror deletes ${mirror.workspaceName} approve; undo them: … restore`);
            return;
        }
        const res = await edgeSettleDeletes(mirror.id, verb);
        if (verb === 'approve') io.success(`${mirror.workspaceName}: ${res.approved} deletions sent to the hub`);
        else io.success(`${mirror.workspaceName}: ${res.restored} files will be downloaded again`);
    },
};

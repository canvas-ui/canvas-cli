'use strict';

import { UsageError } from '../../../core/errors.js';
import { findMirror, parseWorkspaceSpec, upsertMirror } from '../lib/config.js';
import { pin } from '../lib/fuse.js';

export default {
    name: 'pin',
    description: 'Keep a folder offline: `pin add|rm|list <workspace> [<folder|glob>]`',
    positional: [{ name: 'op', required: true }, { name: 'workspace', required: true }, { name: 'glob', required: false }],
    async run({ args, io }) {
        const mirror = findMirror(args.workspace);
        if (!mirror) throw new UsageError(`No mirror for '${args.workspace}'`);
        const op = String(args.op);
        if (op === 'list') {
            io.output((mirror.pins || []).map((p) => ({ pin: p })), { columns: ['pin'] });
            return;
        }
        if (!['add', 'rm', 'remove'].includes(op)) throw new UsageError('op must be add | rm | list');
        if (!args.glob) throw new UsageError('A folder or glob is required');
        const glob = parseWorkspaceSpec(`x:${args.glob}`).pins[0];
        const pins = new Set(mirror.pins || []);
        if (op === 'add') pins.add(glob); else pins.delete(glob);
        upsertMirror({ ...mirror, pins: [...pins] });
        const res = await pin(mirror.mountpoint, op === 'add' ? 'add' : 'rm', glob);
        if (res.ok) io.success(`${op === 'add' ? 'Pinned' : 'Unpinned'} ${glob} (${mirror.workspaceName})`);
        else io.warn(`Saved to config; daemon not updated (${res.stderr.trim() || 'not running'}) — takes effect on next start`);
    },
};

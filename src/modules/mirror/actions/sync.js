'use strict';

import { findMirror, listMirrors } from '../lib/config.js';
import { syncNow } from '../lib/fuse.js';
import { edgeResync } from '../lib/edge.js';

export default {
    name: 'sync',
    description: 'Reconcile now instead of waiting for the next poll',
    positional: [{ name: 'workspace', required: false }],
    async run({ args, io }) {
        const targets = args.workspace ? [findMirror(args.workspace)].filter(Boolean) : listMirrors();
        if (targets.length === 0) { io.warn('No such mirror'); return; }
        for (const mirror of targets) {
            if (mirror.client === 'daemon') {
                try { await edgeResync(mirror.id); io.success(`${mirror.workspaceName}: reconciled`); }
                catch (e) { io.warn(`${mirror.workspaceName}: ${e.message}`); }
                continue;
            }
            const res = await syncNow(mirror.mountpoint);
            if (res.ok) io.success(`${mirror.workspaceName}: sync requested`);
            else io.warn(`${mirror.workspaceName}: ${res.stderr.trim() || 'daemon not running'}`);
        }
    },
};

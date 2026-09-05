'use strict';

import { UsageError } from '../../../core/errors.js';
import { findMirror, removeMirror } from '../lib/config.js';
import { unmount } from '../lib/fuse.js';
import { stopProcess } from '../lib/pm2.js';
import { edgeReload } from '../lib/edge.js';

export default {
    name: 'remove',
    aliases: ['rm'],
    description: 'Stop mirroring a workspace on this device (files in the cache are kept until the data dir is cleaned)',
    positional: [{ name: 'workspace', required: true }],
    async run({ args, io }) {
        const mirror = findMirror(args.workspace);
        if (!mirror) throw new UsageError(`No mirror for '${args.workspace}'`);
        if (mirror.client === 'daemon') {
            removeMirror(mirror.id);
            await edgeReload().catch(() => null);
            io.success(`Removed ${mirror.id} (folder left in place)`);
            return;
        }
        if (mirror.managed === 'pm2') {
            await stopProcess(mirror).catch((e) => io.warn(e.message));
        }
        const res = await unmount(mirror.mountpoint).catch(() => ({ ok: false, stderr: 'canvas-fuse not available' }));
        if (!res.ok) io.warn(`Unmount: ${String(res.stderr || '').trim() || 'not mounted'}`);
        removeMirror(mirror.id);
        io.success(`Removed ${mirror.id}`);
    },
};

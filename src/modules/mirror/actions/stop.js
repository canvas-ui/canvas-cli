'use strict';

import { UsageError } from '../../../core/errors.js';
import { findMirror, listMirrors } from '../lib/config.js';
import { unmount } from '../lib/fuse.js';
import { stopProcess } from '../lib/pm2.js';

export default {
    name: 'stop',
    description: 'Unmount a mirror (or `all`); the cache and queue stay for the next start',
    positional: [{ name: 'workspace', required: true }],
    async run({ args, io }) {
        const targets = args.workspace === 'all' ? listMirrors() : [findMirror(args.workspace)].filter(Boolean);
        if (targets.length === 0) throw new UsageError(`No mirror for '${args.workspace}'`);
        for (const mirror of targets) {
            if (mirror.managed === 'pm2') {
                const { name, stopped } = await stopProcess(mirror).catch((e) => { io.warn(e.message); return { name: mirror.id, stopped: false }; });
                io.success(`${stopped ? 'Stopped' : 'Not running'}: ${name}`);
            }
            const res = await unmount(mirror.mountpoint);
            if (res.ok) io.success(`Unmounted ${mirror.mountpoint}`);
            else io.info(`${mirror.mountpoint}: ${res.stderr.trim() || 'not mounted'}`);
        }
    },
};

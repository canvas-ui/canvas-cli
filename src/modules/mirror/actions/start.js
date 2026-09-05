'use strict';

import { UsageError } from '../../../core/errors.js';
import { findMirror, listMirrors } from '../lib/config.js';
import { mount, mountForeground } from '../lib/fuse.js';
import { startProcess } from '../lib/pm2.js';
import { ensureEdgeService } from '../lib/edge.js';

export default {
    name: 'start',
    description: 'Start a mirror (or `all`)',
    positional: [{ name: 'workspace', required: true }],
    flags: { foreground: 'boolean' },
    async run({ args, flags, io }) {
        const targets = args.workspace === 'all' ? listMirrors() : [findMirror(args.workspace)].filter(Boolean);
        if (targets.length === 0) throw new UsageError(`No mirror for '${args.workspace}'`);
        if (flags.foreground) {
            if (targets.length !== 1) throw new UsageError('--foreground runs exactly one mirror');
            const code = await mountForeground(targets[0]);
            process.exitCode = code;
            return;
        }
        if (targets.some((m) => m.client === 'daemon')) {
            const { started } = await ensureEdgeService(io);
            io.success(`${started ? 'Started' : 'Reloaded'} canvas-edge`);
        }
        for (const mirror of targets.filter((m) => m.client !== 'daemon')) {
            if (mirror.managed === 'pm2') {
                const { name, started } = await startProcess(mirror);
                io.success(`${started ? 'Started' : 'Already running'}: ${name}`);
            } else {
                const res = await mount(mirror);
                if (res.ok) io.success(`Mounted ${mirror.mountpoint}`);
                else io.error(`Mount failed for ${mirror.workspaceName}: ${res.stderr.trim() || res.stdout.trim()}`);
            }
        }
    },
};

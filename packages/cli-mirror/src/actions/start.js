'use strict';

import { UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { findMirror, listMirrors } from '../lib/config.js';
import { mountForeground } from '../lib/fuse.js';
import { startMirrors } from '../lib/lifecycle.js';

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
        await startMirrors(targets, io);
    },
};

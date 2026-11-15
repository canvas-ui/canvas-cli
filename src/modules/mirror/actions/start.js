'use strict';

import { UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { findMirror, listMirrors } from '../lib/config.js';
import { isMounted, mountForeground } from '../lib/fuse.js';
import { rejectExtraArgs, startMirrors } from '../lib/lifecycle.js';

export default {
    name: 'start',
    description: 'Start a mirror (or `all`)',
    positional: [{ name: 'workspace', required: true }],
    flags: { foreground: 'boolean' },
    async run({ args, flags, rest, io }) {
        const targets = args.workspace === 'all' ? listMirrors() : [findMirror(args.workspace)].filter(Boolean);
        if (targets.length === 0) throw new UsageError(`No mirror for '${args.workspace}'`);
        rejectExtraArgs('start', rest, targets);
        if (flags.foreground) {
            if (targets.length !== 1) throw new UsageError('--foreground runs exactly one mirror');
            if (targets[0].client === 'daemon' || targets[0].managed === 'edge') throw new UsageError(`--foreground is for canvas-fuse mounts; '${targets[0].workspaceName}' is run by canvas-edge`);
            if (await isMounted(targets[0].mountpoint)) throw new UsageError(`'${targets[0].workspaceName}' is already mounted in the background — \`canvas mirror stop ${targets[0].workspaceName}\` first`);
            const code = await mountForeground(targets[0]);
            process.exitCode = code;
            return;
        }
        await startMirrors(targets, io);
    },
};

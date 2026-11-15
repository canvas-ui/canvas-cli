'use strict';

import { UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { findMirror, listMirrors } from '../lib/config.js';
import { rejectExtraArgs, startMirrors } from '../lib/lifecycle.js';

export default {
    name: 'restart',
    description: 'Stop and start a mirror (or `all`) — picks up config changes and revives dead mounts',
    positional: [{ name: 'workspace', required: true }],
    async run({ args, rest, io }) {
        const targets = args.workspace === 'all' ? listMirrors() : [findMirror(args.workspace)].filter(Boolean);
        if (targets.length === 0) throw new UsageError(`No mirror for '${args.workspace}'`);
        rejectExtraArgs('restart', rest, targets);
        await startMirrors(targets, io, { restart: true });
    },
};

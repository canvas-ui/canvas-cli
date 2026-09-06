'use strict';

import { UsageError } from '../../../core/errors.js';
import { findMirror, listMirrors } from '../lib/config.js';
import { startMirrors } from '../lib/lifecycle.js';

export default {
    name: 'restart',
    description: 'Stop and start a mirror (or `all`) — picks up config changes and revives dead mounts',
    positional: [{ name: 'workspace', required: true }],
    async run({ args, io }) {
        const targets = args.workspace === 'all' ? listMirrors() : [findMirror(args.workspace)].filter(Boolean);
        if (targets.length === 0) throw new UsageError(`No mirror for '${args.workspace}'`);
        await startMirrors(targets, io, { restart: true });
    },
};

'use strict';

import { setPaused } from '../lib/lifecycle.js';

export default {
    name: 'pause',
    description: 'Hold all transfers of a mirror (or every mirror); the mount stays up and local edits queue',
    positional: [{ name: 'workspace', required: false }],
    async run({ args, io }) {
        await setPaused(args.workspace, true, io);
    },
};

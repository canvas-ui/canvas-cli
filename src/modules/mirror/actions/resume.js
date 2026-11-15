'use strict';

import { setPaused } from '../lib/lifecycle.js';

export default {
    name: 'resume',
    description: 'Lift `mirror pause` and catch up',
    positional: [{ name: 'workspace', required: false }],
    async run({ args, io }) {
        await setPaused(args.workspace, false, io);
    },
};

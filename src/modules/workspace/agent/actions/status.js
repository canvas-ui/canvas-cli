'use strict';

import { UsageError } from '../../../../core/errors.js';

export default {
    name: 'status',
    description: 'Agent status',
    positional: [{ name: 'agent', required: true }],
    async run({ parent, args, io }) {
        if (!parent.workspace) throw new UsageError('Workspace address required');
        if (!args.agent) throw new UsageError('Agent name required');
        const st = await parent.workspace.api.agents.status(args.agent);
        io.output(st);
    },
};

'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'status',
    description: 'Agent lifecycle status',
    positional: [{ name: 'agent' }],
    async run({ parent, args, client, io }) {
        const agent = parent.agent || (args.agent && (await import('../resolve.js')).default(args.agent, { client }));
        if (!agent) throw new UsageError('Agent name required');
        io.output(await agent.api.agents.status(agent.name));
    },
};

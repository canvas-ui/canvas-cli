'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'show',
    aliases: ['get'],
    description: 'Show agent details',
    positional: [{ name: 'agent' }],
    async run({ parent, args, client, io }) {
        const agent = parent.agent || (args.agent && (await import('../resolve.js')).default(args.agent, { client }));
        if (!agent) throw new UsageError('Agent name required');
        const data = await agent.api.agents.get(agent.name);
        io.output(data);
    },
};

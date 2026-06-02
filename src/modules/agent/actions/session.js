'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'session',
    description: 'Show current agent session',
    positional: [{ name: 'agent' }],
    async run({ parent, args, client, io }) {
        const agent = parent.agent || (args.agent && (await import('../resolve.js')).default(args.agent, { client }));
        if (!agent) throw new UsageError('Agent name required');
        io.output(await agent.api.get(`/agents/${encodeURIComponent(agent.name)}/session`));
    },
};

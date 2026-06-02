'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'restart',
    description: 'Restart an agent',
    positional: [{ name: 'agent' }],
    async run({ parent, args, client, io }) {
        const agent = parent.agent || (args.agent && (await import('../resolve.js')).default(args.agent, { client }));
        if (!agent) throw new UsageError('Agent name required');
        await agent.api.post(`/agents/${encodeURIComponent(agent.name)}/restart`);
        io.success(`Agent '${agent.name}' restarted`);
    },
};

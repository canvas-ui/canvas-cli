'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'skills',
    description: 'List installed agent skills',
    positional: [{ name: 'agent' }],
    async run({ parent, args, client, io }) {
        const agent = parent.agent || (args.agent && (await import('../resolve.js')).default(args.agent, { client }));
        if (!agent) throw new UsageError('Agent name required');
        const skills = await agent.api.get(`/agents/${encodeURIComponent(agent.name)}/skills`);
        io.output(Array.isArray(skills) ? skills : []);
    },
};

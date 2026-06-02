'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'delete',
    aliases: ['rm', 'destroy'],
    description: 'Delete an agent',
    positional: [{ name: 'agent' }],
    flags: { force: 'boolean' },
    async run({ parent, args, flags, client, io }) {
        const agent = parent.agent || (args.agent && (await import('../resolve.js')).default(args.agent, { client }));
        if (!agent) throw new UsageError('Agent name required');
        if (!flags.force) {
            io.warn(`Will delete '${agent.name}'. Pass --force.`);
            return;
        }
        await agent.api.delete(`/agents/${encodeURIComponent(agent.name)}`);
        io.success(`Agent '${agent.name}' deleted`);
    },
};

'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'update',
    description: 'Update an agent',
    positional: [{ name: 'agent' }],
    flags: {
        'llm-provider': 'string', model: 'string',
        label: 'string', description: 'string', color: 'string',
        'api-key': 'string', 'base-url': 'string',
    },
    async run({ parent, args, flags, client, io }) {
        const agent = parent.agent || (args.agent && (await import('../resolve.js')).default(args.agent, { client }));
        if (!agent) throw new UsageError('Agent name required');
        const payload = {};
        for (const k of ['label', 'description', 'color', 'model']) {
            if (flags[k] !== undefined) payload[k] = flags[k];
        }
        if (flags['llm-provider'] !== undefined) payload.llmProvider = flags['llm-provider'];
        if (flags['api-key'] !== undefined) payload.apiKey = flags['api-key'];
        if (flags['base-url'] !== undefined) payload.baseUrl = flags['base-url'];
        const out = await agent.api.put(`/agents/${encodeURIComponent(agent.name)}`, payload);
        io.output(out);
    },
};

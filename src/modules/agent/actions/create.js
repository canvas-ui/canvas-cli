'use strict';

import { UsageError, AuthError } from '../../../core/errors.js';

export default {
    name: 'create',
    description: 'Create an agent',
    positional: [{ name: 'name', required: true }],
    flags: {
        'llm-provider': 'string', model: 'string',
        label: 'string', description: 'string', color: 'string',
        'api-key': 'string', 'base-url': 'string',
    },
    async run({ args, flags, client, session, io }) {
        if (!args.name) throw new UsageError('Agent name required');
        const remoteId = session.boundRemote();
        if (!remoteId) throw new AuthError('No remote bound');
        const payload = { name: args.name };
        for (const k of ['label', 'description', 'color', 'model']) {
            if (flags[k] !== undefined) payload[k] = flags[k];
        }
        if (flags['llm-provider'] !== undefined) payload.llmProvider = flags['llm-provider'];
        if (flags['api-key'] !== undefined) payload.apiKey = flags['api-key'];
        if (flags['base-url'] !== undefined) payload.baseUrl = flags['base-url'];
        const agent = await client.client(remoteId).post('/agents', payload);
        io.output(agent);
    },
};

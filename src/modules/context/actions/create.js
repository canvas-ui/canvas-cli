'use strict';

import { UsageError, AuthError } from '../../../core/errors.js';
import { unwrapResource } from '../../../core/api-helpers.js';

export default {
    name: 'create',
    description: 'Create a context',
    positional: [{ name: 'id', required: true }, { name: 'url' }],
    flags: { description: 'string', color: 'string' },
    async run({ args, flags, client, session, io }) {
        if (!args.id) throw new UsageError('Context id required');
        const remoteId = session.boundRemote();
        if (!remoteId) throw new AuthError('No remote bound');
        const data = { id: args.id, description: flags.description || '', metadata: {} };
        if (args.url) {
            data.url = args.url.includes('://')
                ? args.url
                : `universe://${args.url.startsWith('/') ? args.url.slice(1) : args.url}`;
        }
        if (flags.color) data.metadata.color = flags.color;
        const ctx = await client.client(remoteId).contexts.create(data);
        io.success(`Context '${args.id}' created`);
        io.output(unwrapResource(ctx, 'context'));
    },
};

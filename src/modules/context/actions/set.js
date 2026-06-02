'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'set',
    description: 'Set context URL',
    positional: [{ name: 'url', required: true }],
    async run({ parent, args, client, session, io }) {
        if (!args.url) throw new UsageError('URL required');
        const handle = parent.context || (session.boundContext() && client.resolve(session.boundContext()));
        if (!handle) throw new UsageError('Context required');
        const result = await handle.api.post(`/contexts/${handle.id}/url`, { url: args.url });
        const newUrl = result?.url || args.url;
        io.success(`Context URL set to '${newUrl}'`);
        if (session.boundContext() === handle.full) {
            session.set('boundContextUrl', newUrl);
        }
    },
};

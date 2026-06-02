'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'workspace',
    description: 'Show workspace scheme of context URL',
    async run({ parent, client, session, io }) {
        const handle = parent.context || (session.boundContext() && client.resolve(session.boundContext()));
        if (!handle) throw new UsageError('Context required');
        const data = await handle.api.get(`/contexts/${handle.id}/url`);
        const url = data.url || data;
        io.print(url?.includes('://') ? url.split('://')[0] : 'universe');
    },
};

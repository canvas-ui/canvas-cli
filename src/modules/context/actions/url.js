'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'url',
    description: 'Get context URL',
    async run({ parent, client, session, io }) {
        const handle = parent.context || (session.boundContext() && client.resolve(session.boundContext()));
        if (!handle) throw new UsageError('Context required');
        const data = await handle.api.get(`/contexts/${handle.id}/url`);
        io.print(data.url || data);
    },
};

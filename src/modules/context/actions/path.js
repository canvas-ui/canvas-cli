'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'path',
    description: 'Get context path',
    async run({ parent, client, session, io }) {
        const handle = parent.context || (session.boundContext() && client.resolve(session.boundContext()));
        if (!handle) throw new UsageError('Context required');
        const data = await handle.api.get(`/contexts/${handle.id}/path`);
        io.print(data.path || data);
    },
};

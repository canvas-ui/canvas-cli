'use strict';

import { UsageError } from '../../../core/errors.js';
import { unwrapResource } from '../../../core/api-helpers.js';

export default {
    name: 'show',
    description: 'Show context details',
    async run({ parent, client, session, io }) {
        const handle = parent.context || (session.boundContext() && client.resolve(session.boundContext()));
        if (!handle) throw new UsageError('Context address required');
        const ctx = await handle.api.contexts.get(handle.id);
        io.output(unwrapResource(ctx, 'context'));
    },
};

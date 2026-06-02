'use strict';

import { UsageError } from '../../../core/errors.js';
import { unwrapResource } from '../../../core/api-helpers.js';

export default {
    name: 'update',
    description: 'Update a context',
    flags: { description: 'string', metadata: 'string' },
    async run({ parent, flags, io }) {
        if (!parent.context) throw new UsageError('Context address required');
        const data = {};
        if (flags.description) data.description = flags.description;
        if (flags.metadata) data.metadata = JSON.parse(flags.metadata);
        if (Object.keys(data).length === 0) {
            throw new UsageError('Nothing to update. Use --description or --metadata');
        }
        const ctx = await parent.context.api.contexts.update(parent.context.id, data);
        io.success(`Context '${parent.context.full}' updated`);
        io.output(unwrapResource(ctx, 'context'));
    },
};

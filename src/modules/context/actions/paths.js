'use strict';

import { UsageError } from '../../../core/errors.js';
import { extractPaths } from '../../../core/api-helpers.js';

export default {
    name: 'paths',
    description: 'List context tree paths',
    async run({ parent, client, session, io }) {
        const handle = parent.context || (session.boundContext() && client.resolve(session.boundContext()));
        if (!handle) throw new UsageError('Context required');
        const tree = await handle.api.contexts.tree(handle.id);
        if (!tree?.children?.length) { io.warn('No tree'); return; }
        for (const p of extractPaths(tree)) io.print(p);
    },
};

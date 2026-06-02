'use strict';

import { UsageError } from '../../../core/errors.js';
import { displayTree } from '../../../core/api-helpers.js';

export default {
    name: 'tree',
    description: 'Show context tree',
    async run({ parent, flags, client, session, io }) {
        const handle = parent.context || (session.boundContext() && client.resolve(session.boundContext()));
        if (!handle) throw new UsageError('Context required');
        const tree = await handle.api.contexts.tree(handle.id);
        if (flags.format === 'json' || flags.raw) { io.output(tree); return; }
        if (!tree?.children?.length) { io.warn('No tree'); return; }
        io.print(`Context tree: ${handle.full}\n`);
        displayTree(io, tree);
    },
};

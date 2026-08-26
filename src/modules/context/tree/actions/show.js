'use strict';

import { displayTree } from '../../../../core/api-helpers.js';
import { resolveContextHandle } from '../../lib/handle.js';

export default {
    name: 'show',
    aliases: ['get'],
    description: 'Show the context tree',
    async run(ctx) {
        const handle = resolveContextHandle(ctx);
        const tree = await handle.api.contexts.tree(handle.id);
        const { io } = ctx;
        if (io.format === 'json' || io.format === 'raw') { io.output(tree); return; }
        if (!tree?.children?.length) { io.warn('No tree'); return; }
        io.print(`Context tree: ${handle.full}\n`);
        displayTree(io, tree);
    },
};

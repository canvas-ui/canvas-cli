'use strict';

import { extractPaths } from '../../../../core/api-helpers.js';
import { resolveContextHandle } from '../../lib/handle.js';

export default {
    name: 'paths',
    description: 'List the context tree paths, one per line',
    async run(ctx) {
        const handle = resolveContextHandle(ctx);
        const tree = await handle.api.contexts.tree(handle.id);
        if (!tree?.children?.length) { ctx.io.warn('No tree'); return; }
        for (const p of extractPaths(tree)) ctx.io.print(p);
    },
};

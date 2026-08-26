'use strict';

import { extractPaths } from '../../../../core/api-helpers.js';
import { resolveWorkspaceHandle } from '../../lib/handle.js';

// The flat form of `tree show` — one path per line, which is what you pipe
// into another command.
export default {
    name: 'paths',
    description: 'List the paths in a workspace tree, one per line',
    positional: [{ name: 'address' }],
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const tree = await handle.api.workspaces.tree(handle.id);
        if (!tree?.children?.length) { ctx.io.warn('No tree found'); return; }
        for (const p of extractPaths(tree)) ctx.io.print(p);
    },
};

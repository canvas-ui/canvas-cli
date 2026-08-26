'use strict';

import { displayTree } from '../../../../core/api-helpers.js';
import { resolveWorkspaceHandle } from '../../lib/handle.js';

export default {
    name: 'show',
    aliases: ['get'],
    description: 'Show a workspace tree',
    positional: [{ name: 'address' }],
    flags: { tree: 'string' },
    async run(ctx) {
        const { io } = ctx;
        const handle = resolveWorkspaceHandle(ctx);
        const tree = await handle.api.workspaces.tree(handle.id);
        if (io.format === 'json' || io.format === 'raw') { io.output(tree); return; }
        if (!tree?.children?.length) { io.warn('No tree found'); return; }
        io.print(`Workspace tree: ${handle.full}\n`);
        displayTree(io, tree);
    },
};

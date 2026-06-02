'use strict';

import { displayTree } from '../../../core/api-helpers.js';
import { resolveWorkspaceHandle } from '../lib/handle.js';

export default {
    name: 'tree',
    description: 'Show workspace tree',
    positional: [{ name: 'address' }],
    async run(ctx) {
        const { flags, io } = ctx;
        const handle = resolveWorkspaceHandle(ctx);
        const tree = await handle.api.workspaces.tree(handle.id);
        if (flags.format === 'json' || flags.raw) { io.output(tree); return; }
        if (!tree?.children?.length) { io.warn('No tree found'); return; }
        io.print(`Workspace tree: ${handle.full}\n`);
        displayTree(io, tree);
    },
};

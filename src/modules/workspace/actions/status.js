'use strict';

import { resolveWorkspaceHandle } from '../lib/handle.js';

export default {
    name: 'status',
    description: 'Show workspace status',
    positional: [{ name: 'address' }],
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        ctx.io.output(await handle.api.workspaces.status(handle.id));
    },
};

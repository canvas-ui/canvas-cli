'use strict';

import { resolveWorkspaceHandle } from '../lib/handle.js';

export default {
    name: 'start',
    description: 'Start a workspace',
    positional: [{ name: 'address' }],
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        await handle.api.workspaces.start(handle.id);
        ctx.io.success(`Workspace '${handle.full}' started`);
    },
};

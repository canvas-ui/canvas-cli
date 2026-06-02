'use strict';

import { resolveWorkspaceHandle } from '../lib/handle.js';

export default {
    name: 'stop',
    description: 'Stop a workspace',
    positional: [{ name: 'address' }],
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        await handle.api.workspaces.stop(handle.id);
        ctx.io.success(`Workspace '${handle.full}' stopped`);
    },
};

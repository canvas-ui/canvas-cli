'use strict';

import { unwrapResource } from '../../../core/api-helpers.js';
import { resolveWorkspaceHandle } from '../lib/handle.js';

export default {
    name: 'show',
    description: 'Show workspace details',
    positional: [{ name: 'address' }],
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const ws = await handle.api.workspaces.get(handle.id);
        ctx.io.output(unwrapResource(ws, 'workspace'));
    },
};

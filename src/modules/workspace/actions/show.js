'use strict';

import { unwrapResource } from '../../../core/api-helpers.js';
import { resolveWorkspaceHandle } from '../lib/handle.js';
import { WORKSPACE_COLUMNS } from '../lib/columns.js';

export default {
    name: 'show',
    description: 'Show workspace details',
    positional: [{ name: 'address' }],
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const ws = await handle.api.workspaces.get(handle.id);
        // `ws <name>` resolves here (a named resource shows itself), so this
        // is one of the most-typed commands in the CLI — it cannot answer with
        // 25 columns of internals. -f json still carries the whole document.
        ctx.io.detail(unwrapResource(ws, 'workspace'), { columns: WORKSPACE_COLUMNS });
    },
};

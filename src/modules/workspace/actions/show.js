'use strict';

import { unwrapResource } from '../../../core/api-helpers.js';
import { resolveWorkspaceHandle } from '../lib/handle.js';

// `ws <name>` resolves here now (a named resource shows itself), so this is
// one of the most-typed commands in the CLI — it cannot answer with 25 columns
// of internals. -f json still carries the whole document.
const COLUMNS = ['id', 'name', 'label', 'type', 'status', 'owner', 'color', 'updatedAt'];

export default {
    name: 'show',
    description: 'Show workspace details',
    positional: [{ name: 'address' }],
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const ws = await handle.api.workspaces.get(handle.id);
        const doc = unwrapResource(ws, 'workspace');
        const { io } = ctx;
        io.output(doc, io.format === 'table' || io.format === 'csv' ? { columns: COLUMNS } : undefined);
    },
};

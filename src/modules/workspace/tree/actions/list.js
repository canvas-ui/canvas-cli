'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';

const COLUMNS = [
    { key: 'name', label: 'tree' },
    { key: 'type', label: 'type' },
    { key: 'id', label: 'id', dim: true },
];

export default {
    name: 'list',
    aliases: ['ls'],
    description: 'List the trees in a workspace',
    positional: [{ name: 'address' }],
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const res = await handle.api.get(`/workspaces/${encodeURIComponent(handle.id)}/trees`);
        const payload = res?.payload || res;
        const trees = Array.isArray(payload) ? payload : payload?.trees || [];
        ctx.io.output(trees.map((t) => (typeof t === 'string' ? { name: t } : t)), { columns: COLUMNS });
    },
};

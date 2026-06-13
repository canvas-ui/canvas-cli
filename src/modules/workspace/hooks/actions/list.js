'use strict';

import { resolveHandle } from '../lib/handle.js';

export default {
    name: 'list',
    description: 'List workspace hook files',
    flags: { workspace: 'string' },
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const rows = await handle.api.workspaces.hooks.list(handle.id);
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) {
            ctx.io.warn('No hooks');
            return;
        }
        ctx.io.output(list, { columns: ['path', 'size', 'modifiedAt'] });
    },
};

'use strict';

import { resolveHandle } from '../lib/handle.js';
import { summarize } from '../lib/docs.js';
import device from '../lib/device.js';

export default {
    name: 'list',
    aliases: ['ls'],
    description: 'List dotfile documents in the workspace',
    flags: { workspace: 'string', tag: 'string' },
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const params = {};
        if (ctx.flags.tag) params.tag = ctx.flags.tag;
        const docs = await handle.api.workspaces.dotfiles.list(handle.id, params);
        const list = Array.isArray(docs) ? docs : docs?.documents || [];
        if (list.length === 0) { ctx.io.warn('No dotfiles'); return; }
        ctx.io.output(list.map((d) => summarize(d, device.id)));
    },
};

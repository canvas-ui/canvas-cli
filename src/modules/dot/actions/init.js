'use strict';

import { resolveHandle } from '../lib/handle.js';

export default {
    name: 'init',
    description: 'Initialize dotfile repo on server (workspace must exist)',
    flags: { workspace: 'string' },
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const result = await handle.api.workspaces.dotfiles.init(handle.id);
        ctx.io.success(`Dotfile repo initialized for ${handle.full || handle.id}`);
        ctx.io.output(result);
    },
};

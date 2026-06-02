'use strict';

import { resolveHandle } from '../lib/handle.js';
import { pullWithAuth } from '../lib/repo.js';

export default {
    name: 'pull',
    description: 'git pull from workspace dotfile remote',
    flags: { workspace: 'string' },
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const dir = await pullWithAuth(handle);
        ctx.io.success(`Pulled ${dir}`);
    },
};

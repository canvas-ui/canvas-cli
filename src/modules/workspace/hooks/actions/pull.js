'use strict';

import { resolveHandle } from '../lib/handle.js';
import { pullWithAuth } from '../../../dot/lib/repo.js';

export default {
    name: 'pull',
    description: 'Pull workspace git repo',
    flags: { workspace: 'string' },
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const dir = await pullWithAuth(handle);
        ctx.io.success(`Pulled ${dir}`);
    },
};

'use strict';

import pullAction from './pull.js';
import pushAction from './push.js';
import applyAction from './apply.js';

export default {
    name: 'sync',
    description: 'pull → push → apply (idempotent reconciliation)',
    flags: { workspace: 'string', message: 'string' },
    async run(ctx) {
        await pullAction.run(ctx);
        await pushAction.run(ctx);
        await applyAction.run({ ...ctx, args: {} });
        ctx.io.success('Sync complete');
    },
};

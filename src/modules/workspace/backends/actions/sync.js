'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';

export default {
    name: 'sync',
    description: 'Trigger a backend re-scan (runs in the background)',
    aliases: ['resync'],
    positional: [{ name: 'backend', required: true }],
    flags: { workspace: 'string', driver: 'string' },
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        if (!ctx.args.backend) throw new UsageError('Backend address required');
        const driver = ctx.flags.driver === 'fs' ? 'file' : (ctx.flags.driver || 'file');
        await handle.api.workspaces.backends.sync(handle.id, driver, ctx.args.backend);
        ctx.io.success(`Re-sync of ${driver}/${ctx.args.backend} started`);
    },
};

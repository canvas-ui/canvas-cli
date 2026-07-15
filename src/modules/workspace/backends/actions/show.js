'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';

export default {
    name: 'show',
    description: 'Show one backend (config, capabilities, status)',
    aliases: ['get'],
    // Named `backend`, not `address`, so resolveWorkspaceHandle never mistakes
    // it for a workspace address.
    positional: [{ name: 'backend', required: true }],
    flags: { workspace: 'string', driver: 'string' },
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        if (!ctx.args.backend) throw new UsageError('Backend address required (e.g. financial-reports)');
        const driver = ctx.flags.driver === 'fs' ? 'file' : (ctx.flags.driver || 'file');
        const backend = await handle.api.workspaces.backends.get(handle.id, driver, ctx.args.backend);
        ctx.io.output(backend);
    },
};

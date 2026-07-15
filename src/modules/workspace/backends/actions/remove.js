'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';

export default {
    name: 'remove',
    description: 'Remove (unmount) a data backend — no files are deleted',
    aliases: ['rm', 'unmount'],
    positional: [{ name: 'backend', required: true }],
    flags: { workspace: 'string', driver: 'string' },
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        if (!ctx.args.backend) throw new UsageError('Backend address required');
        const driver = ctx.flags.driver === 'fs' ? 'file' : (ctx.flags.driver || 'file');
        await handle.api.workspaces.backends.remove(handle.id, driver, ctx.args.backend);
        ctx.io.success(`Removed ${driver}/${ctx.args.backend} (files untouched; purge mirrored entries via: ws tree-rm --tree backends)`);
    },
};

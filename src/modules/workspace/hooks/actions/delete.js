'use strict';

import { resolveHandle } from '../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';

export default {
    name: 'delete',
    aliases: ['rm', 'remove'],
    description: 'Delete a workspace hook file',
    positional: [{ name: 'hookPath', required: true }],
    flags: { workspace: 'string', force: 'boolean' },
    async run(ctx) {
        const { args, flags, io } = ctx;
        if (!args.hookPath) throw new UsageError('hookPath required');
        if (!flags.force) {
            io.warn(`Will delete hook '${args.hookPath}'. Pass --force.`);
            return;
        }
        const handle = resolveHandle(ctx);
        await handle.api.workspaces.hooks.delete(handle.id, args.hookPath);
        io.success(`Deleted ${args.hookPath}`);
    },
};

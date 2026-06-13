'use strict';

import { resolveHandle } from '../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';

export default {
    name: 'get',
    aliases: ['show', 'cat'],
    description: 'Show hook source',
    positional: [{ name: 'hookPath', required: true }],
    flags: { workspace: 'string' },
    async run(ctx) {
        const { args, io } = ctx;
        if (!args.hookPath) throw new UsageError('hookPath required');
        const handle = resolveHandle(ctx);
        const result = await handle.api.workspaces.hooks.get(handle.id, args.hookPath);
        const content = result?.content ?? '';
        io.print(content);
    },
};

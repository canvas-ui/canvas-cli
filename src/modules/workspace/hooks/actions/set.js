'use strict';

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveHandle } from '../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';

export default {
    name: 'set',
    aliases: ['put', 'save'],
    description: 'Save hook source to workspace (REST, live immediately)',
    positional: [{ name: 'hookPath', required: true }],
    flags: { workspace: 'string', file: 'string', content: 'string' },
    async run(ctx) {
        const { args, flags, io, stdin } = ctx;
        if (!args.hookPath) throw new UsageError('hookPath required');
        let content = flags.content ?? stdin ?? '';
        if (flags.file) {
            const file = resolve(flags.file);
            if (!existsSync(file)) throw new UsageError(`File not found: ${file}`);
            content = readFileSync(file, 'utf8');
        }
        if (!content) throw new UsageError('Pass --file, --content, or pipe stdin');
        const handle = resolveHandle(ctx);
        await handle.api.workspaces.hooks.set(handle.id, args.hookPath, content);
        io.success(`Saved hook ${args.hookPath}`);
        io.info('Use `canvas ws <name> hooks push` to version in git.');
    },
};

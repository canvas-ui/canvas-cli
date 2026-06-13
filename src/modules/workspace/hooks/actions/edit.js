'use strict';

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { resolveHandle } from '../lib/handle.js';
import { hooksDir } from '../../../dot/lib/paths.js';
import { ensureCloned } from '../../../dot/lib/repo.js';
import { UsageError } from '../../../../core/errors.js';

export default {
    name: 'edit',
    description: 'Write hook source to local clone (then hook push)',
    positional: [{ name: 'hookPath', required: true }],
    flags: { workspace: 'string', file: 'string' },
    async run(ctx) {
        const { args, flags, io, stdin } = ctx;
        if (!args.hookPath) throw new UsageError('hookPath required');
        let content = stdin ?? '';
        if (flags.file) {
            const file = resolve(flags.file);
            if (!existsSync(file)) throw new UsageError(`File not found: ${file}`);
            content = readFileSync(file, 'utf8');
        }
        if (!content) throw new UsageError('Pass --file or pipe stdin');
        const handle = resolveHandle(ctx);
        await ensureCloned(handle);
        const target = `${hooksDir(handle)}/${args.hookPath}`;
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content, 'utf8');
        io.success(`Wrote ${target}`);
        io.info('Run `canvas ws <name> hooks push` to publish.');
    },
};

'use strict';

import { existsSync, rmSync } from 'node:fs';
import { resolveHandle } from '../lib/handle.js';
import { repoFilePath } from '../lib/paths.js';
import { findByRepoPath } from '../lib/docs.js';
import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'remove',
    aliases: ['rm', 'delete'],
    description: 'Delete file from repo + remove document from workspace',
    positional: [{ name: 'repoPath', required: true }],
    flags: { workspace: 'string', force: 'boolean' },
    async run(ctx) {
        const { args, flags, io } = ctx;
        if (!args.repoPath) throw new UsageError('repoPath required');
        if (!flags.force) {
            io.warn(`Will delete dotfile '${args.repoPath}'. Pass --force.`);
            return;
        }
        const handle = resolveHandle(ctx);
        const docs = await handle.api.workspaces.dotfiles.list(handle.id);
        const doc = findByRepoPath(docs, args.repoPath);
        if (!doc) throw new NotFoundError(`No dotfile '${args.repoPath}'`);
        await handle.api.workspaces.dotfiles.delete(handle.id, [doc.id]);
        const target = repoFilePath(handle, args.repoPath);
        if (existsSync(target)) rmSync(target, { recursive: true, force: true });
        io.success(`Removed '${args.repoPath}'. Run \`canvas dot push\` to publish deletion.`);
    },
};

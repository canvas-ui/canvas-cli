'use strict';

import { existsSync, lstatSync, copyFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { resolveHandle } from '../lib/handle.js';
import { ensureCloned } from '../lib/repo.js';
import { repoFilePath } from '../lib/paths.js';
import { expandHome, collapseHome } from '../lib/fsops.js';
import { findByRepoPath } from '../lib/docs.js';
import device from '../lib/device.js';
import { UsageError } from '../../../core/errors.js';

export default {
    name: 'add',
    description: 'Copy local file or folder into dotfile repo + register document with this device`s link',
    positional: [
        { name: 'localPath', required: true },
        { name: 'repoPath' },
    ],
    flags: {
        workspace: 'string',
        'repo-path': 'string',
        description: 'string',
        tag: 'string',
    },
    async run(ctx) {
        const { args, flags, io } = ctx;
        const handle = resolveHandle(ctx);
        const localAbs = resolve(expandHome(args.localPath));
        if (!existsSync(localAbs)) throw new UsageError(`Not found: ${localAbs}`);

        const stat = lstatSync(localAbs);
        const type = stat.isDirectory() ? 'folder' : 'file';

        // Default repoPath: strip leading dot from basename (e.g. .config → config)
        const defaultRepoPath = basename(localAbs).replace(/^\./, '');
        const repoPath = (args.repoPath || flags['repo-path'] || defaultRepoPath)
            .replace(/^\/+/, '');
        if (!repoPath) throw new UsageError('repoPath required');

        await ensureCloned(handle);
        const target = repoFilePath(handle, repoPath);

        if (type === 'folder') {
            // Replace any existing folder in the repo with the new contents.
            if (existsSync(target)) rmSync(target, { recursive: true, force: true });
            mkdirSync(dirname(target), { recursive: true });
            cpSync(localAbs, target, { recursive: true, dereference: false });
        } else {
            mkdirSync(dirname(target), { recursive: true });
            copyFileSync(localAbs, target);
        }

        const existing = findByRepoPath(
            await handle.api.workspaces.dotfiles.list(handle.id),
            repoPath,
        );

        const links = {
            ...(existing?.data?.links || {}),
            [device.id]: collapseHome(localAbs),
        };
        const data = {
            repoPath,
            type,
            links,
            description: flags.description ?? existing?.data?.description,
            tags: flags.tag ? [flags.tag] : (existing?.data?.tags || []),
        };

        if (existing) {
            await handle.api.workspaces.dotfiles.update(handle.id, [{
                id: existing.id, data,
            }]);
            io.success(`Updated '${repoPath}' (${type}); linked to device ${device.id}`);
        } else {
            await handle.api.workspaces.dotfiles.create(handle.id, data);
            io.success(`Added '${repoPath}' (${type}); linked to device ${device.id}`);
        }
        io.info(`Repo: ${target}`);
        io.info('Run `canvas dot push` to publish.');
    },
};

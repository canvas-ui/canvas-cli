'use strict';

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveHandle } from '../lib/handle.js';
import { localRepoDir, hooksDir } from '../../../dot/lib/paths.js';
import { git, status as gitStatus } from '../../../dot/lib/git.js';
import { pushWithAuth } from '../../../dot/lib/repo.js';
import { config } from '../../../../core/storage.js';
import { CanvasError } from '../../../../core/errors.js';

export default {
    name: 'push',
    description: 'Commit hooks/ changes and push to workspace git remote',
    flags: { workspace: 'string', message: 'string', sync: 'boolean' },
    async run(ctx) {
        const { flags, io } = ctx;
        const handle = resolveHandle(ctx);
        const dir = localRepoDir(handle);
        if (!existsSync(dir)) throw new CanvasError('No local clone. Run `canvas ws <name> hooks clone` first.');

        if (flags.sync) {
            const rows = await handle.api.workspaces.hooks.list(handle.id);
            const list = Array.isArray(rows) ? rows : [];
            const root = hooksDir(handle);
            mkdirSync(root, { recursive: true });
            for (const row of list) {
                const result = await handle.api.workspaces.hooks.get(handle.id, row.path);
                const content = result?.content ?? '';
                const target = `${root}/${row.path}`;
                mkdirSync(dirname(target), { recursive: true });
                writeFileSync(target, content, 'utf8');
            }
            io.info(`Synced ${list.length} hook(s) from server to local clone`);
        }

        const hooksRel = config.get('hooksDir') || 'hooks';
        const changes = await gitStatus(dir);
        const hookChanges = changes.filter((c) => c.path === hooksRel || c.path.startsWith(`${hooksRel}/`));
        if (hookChanges.length) {
            const msg = flags.message || `hooks update ${new Date().toISOString()}`;
            await git(['add', hooksRel], { cwd: dir });
            await git(['commit', '-m', msg], { cwd: dir });
            io.success(`Committed ${hookChanges.length} hook change(s): ${msg}`);
        } else {
            io.info('No local hook changes to commit');
        }
        await pushWithAuth(handle);
        io.success(`Pushed ${dir}`);
    },
};

'use strict';

import { resolveHandle } from '../lib/handle.js';
import { localRepoDir } from '../lib/paths.js';
import { git, status as gitStatus } from '../lib/git.js';
import { pushWithAuth } from '../lib/repo.js';
import { existsSync } from 'node:fs';
import { CanvasError } from '../../../core/errors.js';

export default {
    name: 'push',
    description: 'Commit local changes (if any) and push to workspace remote',
    flags: { workspace: 'string', message: 'string' },
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const dir = localRepoDir(handle);
        if (!existsSync(dir)) throw new CanvasError('No local clone. Run `canvas dot clone` first.');
        const changes = await gitStatus(dir);
        if (changes.length) {
            const msg = ctx.flags.message || `dot update ${new Date().toISOString()}`;
            await git(['add', '-A'], { cwd: dir });
            await git(['commit', '-m', msg], { cwd: dir });
            ctx.io.success(`Committed ${changes.length} file(s): ${msg}`);
        } else {
            ctx.io.info('No local changes to commit');
        }
        await pushWithAuth(handle);
        ctx.io.success(`Pushed ${dir}`);
    },
};

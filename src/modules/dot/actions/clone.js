'use strict';

import { resolveHandle } from '../lib/handle.js';
import { ensureCloned } from '../lib/repo.js';
import { localRepoDir } from '../lib/paths.js';
import { existsSync } from 'node:fs';

export default {
    name: 'clone',
    description: 'Clone workspace dotfile repo to local working dir',
    flags: { workspace: 'string', force: 'boolean' },
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const dir = localRepoDir(handle);
        if (existsSync(dir) && !ctx.flags.force) {
            ctx.io.warn(`Already cloned at ${dir}. Pass --force to wipe.`);
            return;
        }
        if (existsSync(dir) && ctx.flags.force) {
            const { rm } = await import('node:fs/promises');
            await rm(dir, { recursive: true, force: true });
        }
        await ensureCloned(handle);
        ctx.io.success(`Cloned to ${dir}`);
    },
};

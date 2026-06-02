'use strict';

import { existsSync } from 'node:fs';
import { resolveHandle } from '../lib/handle.js';
import { localRepoDir } from '../lib/paths.js';
import { currentBranch, status as gitStatus, aheadBehind, isRepo } from '../lib/git.js';
import device from '../lib/device.js';

export default {
    name: 'status',
    description: 'Show dotfile repo + local clone state',
    needsConnection: false,
    flags: { workspace: 'string' },
    async run(ctx) {
        const { io } = ctx;
        const handle = resolveHandle(ctx);
        io.print(`Workspace: ${handle.full || handle.id}`);
        io.print(`Device:    ${device.id}`);
        const dir = localRepoDir(handle);
        if (!existsSync(dir) || !(await isRepo(dir))) {
            io.warn(`No local clone at ${dir}`);
            io.info(`Run: canvas dot clone ${handle.full || handle.id}`);
            return;
        }
        const branch = await currentBranch(dir);
        const changes = await gitStatus(dir);
        const { ahead, behind } = await aheadBehind(dir, branch);
        io.output({
            localDir: dir,
            branch,
            dirty: changes.length > 0,
            ahead, behind,
            changedFiles: changes.length,
        });
        if (changes.length) {
            io.output(changes.slice(0, 20), { columns: ['flag', 'path'] });
            if (changes.length > 20) io.info(`(+${changes.length - 20} more)`);
        }
    },
};

'use strict';

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { resolveHandle } from '../lib/handle.js';
import { localRepoDir } from '../lib/paths.js';
import { findByRepoPath } from '../lib/docs.js';
import { expandHome, isAppliedSymlink, unlinkSafe } from '../lib/fsops.js';
import device from '../lib/device.js';

export default {
    name: 'unapply',
    description: 'Remove the symlink(s) installed by `apply`',
    positional: [{ name: 'repoPath' }],
    flags: { workspace: 'string' },
    async run(ctx) {
        const { args, io } = ctx;
        const handle = resolveHandle(ctx);
        const repoDir = localRepoDir(handle);
        if (!existsSync(repoDir)) { io.warn('No local clone'); return; }
        const docs = await handle.api.workspaces.dotfiles.list(handle.id);
        const list = Array.isArray(docs) ? docs : docs?.documents || [];
        const targets = args.repoPath
            ? [findByRepoPath(list, args.repoPath)].filter(Boolean)
            : list.filter((d) => d?.data?.links?.[device.id]);
        const rows = [];
        for (const doc of targets) {
            const localRel = doc.data.links?.[device.id];
            if (!localRel) continue;
            const local = expandHome(localRel);
            const source = join(repoDir, doc.data.repoPath);
            if (isAppliedSymlink(local, source)) {
                unlinkSafe(local);
                rows.push({ repoPath: doc.data.repoPath, status: 'unlinked', local });
            } else {
                rows.push({ repoPath: doc.data.repoPath, status: 'not-a-canvas-link', local });
            }
        }
        io.output(rows);
    },
};

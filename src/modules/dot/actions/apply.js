'use strict';

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveHandle } from '../lib/handle.js';
import { ensureCloned } from '../lib/repo.js';
import { findByRepoPath } from '../lib/docs.js';
import { expandHome, symlinkInto, isAppliedSymlink } from '../lib/fsops.js';
import device from '../lib/device.js';
import { CanvasError } from '../../../core/errors.js';

export default {
    name: 'apply',
    description: 'Install dotfile(s) for this device (symlink local → repo)',
    positional: [{ name: 'repoPath' }],
    flags: { workspace: 'string', copy: 'boolean' },
    async run(ctx) {
        const { args, flags, io } = ctx;
        const handle = resolveHandle(ctx);
        const repoDir = await ensureCloned(handle);
        const docs = await handle.api.workspaces.dotfiles.list(handle.id);
        const list = Array.isArray(docs) ? docs : docs?.documents || [];
        const targets = args.repoPath
            ? [findByRepoPath(list, args.repoPath)].filter(Boolean)
            : list.filter((d) => d?.data?.links?.[device.id]);
        if (targets.length === 0) {
            io.warn(args.repoPath
                ? `No dotfile '${args.repoPath}'`
                : 'No dotfiles linked to this device');
            return;
        }
        const rows = [];
        for (const doc of targets) {
            const localRel = doc.data.links?.[device.id];
            if (!localRel) {
                rows.push({ repoPath: doc.data.repoPath, status: 'skip (not linked)' });
                continue;
            }
            const source = join(repoDir, doc.data.repoPath);
            if (!existsSync(source)) {
                rows.push({ repoPath: doc.data.repoPath, status: 'missing-in-repo' });
                continue;
            }
            const local = expandHome(localRel);
            if (isAppliedSymlink(local, source)) {
                rows.push({ repoPath: doc.data.repoPath, status: 'already-applied', local });
                continue;
            }
            if (flags.copy) {
                const { copyInto } = await import('../lib/fsops.js');
                copyInto(source, local);
                rows.push({ repoPath: doc.data.repoPath, status: 'copied', local });
            } else {
                symlinkInto(source, local);
                rows.push({ repoPath: doc.data.repoPath, status: 'linked', local });
            }
        }
        io.output(rows);
    },
};

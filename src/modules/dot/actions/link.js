'use strict';

import { resolve } from 'node:path';
import { resolveHandle } from '../lib/handle.js';
import { findByRepoPath } from '../lib/docs.js';
import { expandHome, collapseHome } from '../lib/fsops.js';
import device from '../lib/device.js';
import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'link',
    description: 'Link an existing dotfile repoPath to this device at <localPath>',
    positional: [
        { name: 'repoPath', required: true },
        { name: 'localPath' },
    ],
    flags: { workspace: 'string' },
    async run(ctx) {
        const { args, io } = ctx;
        const handle = resolveHandle(ctx);
        if (!args.repoPath) throw new UsageError('repoPath required');
        const docs = await handle.api.workspaces.dotfiles.list(handle.id);
        const doc = findByRepoPath(docs, args.repoPath);
        if (!doc) throw new NotFoundError(`No dotfile with repoPath '${args.repoPath}'`);
        const localAbs = collapseHome(resolve(expandHome(args.localPath || `$HOME/${args.repoPath}`)));
        const links = { ...(doc.data.links || {}), [device.id]: localAbs };
        await handle.api.workspaces.dotfiles.update(handle.id, [{
            id: doc.id,
            data: { ...doc.data, links },
        }]);
        io.success(`Linked '${args.repoPath}' → ${localAbs} on device ${device.id}`);
    },
};

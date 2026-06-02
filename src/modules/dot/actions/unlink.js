'use strict';

import { resolveHandle } from '../lib/handle.js';
import { findByRepoPath } from '../lib/docs.js';
import device from '../lib/device.js';
import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'unlink',
    description: 'Remove this device from a dotfile`s link map',
    positional: [{ name: 'repoPath', required: true }],
    flags: { workspace: 'string', device: 'string' },
    async run(ctx) {
        const { args, flags, io } = ctx;
        const handle = resolveHandle(ctx);
        if (!args.repoPath) throw new UsageError('repoPath required');
        const docs = await handle.api.workspaces.dotfiles.list(handle.id);
        const doc = findByRepoPath(docs, args.repoPath);
        if (!doc) throw new NotFoundError(`No dotfile '${args.repoPath}'`);
        const target = flags.device || device.id;
        const links = { ...(doc.data.links || {}) };
        if (!(target in links)) { io.warn(`Device '${target}' not linked`); return; }
        delete links[target];
        await handle.api.workspaces.dotfiles.update(handle.id, [{
            id: doc.id, data: { ...doc.data, links },
        }]);
        io.success(`Unlinked device '${target}' from '${args.repoPath}'`);
    },
};

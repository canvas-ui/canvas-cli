'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';

// Mount a local folder (on the server host) as an fs data backend:
//   canvas ws <addr> backends add "Financial Reports" --path /mnt/data/reports --watch --read-only
// The name is the human handle; its slug becomes the backend address and the
// /device/<device>/<mount> node in the backends tree. Content is indexed in
// place as device-scoped file:// locations — nothing is copied or uploaded.
export default {
    name: 'add',
    description: 'Mount a local folder as an fs data backend (indexed in place)',
    aliases: ['mount'],
    positional: [{ name: 'backend', required: true }],
    flags: { workspace: 'string', driver: 'string', path: 'string', root: 'string', exclude: 'string', watch: 'boolean', 'read-only': 'boolean' },
    async run(ctx) {
        const { args, flags, io } = ctx;
        const handle = resolveWorkspaceHandle(ctx);
        const name = args.backend;
        if (!name) throw new UsageError('Mount name required (e.g. "Financial Reports")');
        const path = flags.path || flags.root;
        if (!path) throw new UsageError('Folder path required (--path /abs/path)');
        const driver = flags.driver === 'fs' ? 'file' : (flags.driver || 'file');
        if (driver !== 'file') throw new UsageError(`Unsupported driver for add: ${driver}`);

        const body = {
            name,
            path,
            watch: Boolean(flags.watch),
            readOnly: Boolean(flags['read-only']),
        };
        if (flags.exclude) {
            body.exclude = String(flags.exclude).split(',').map((p) => p.trim()).filter(Boolean);
        }

        const backend = await handle.api.workspaces.backends.add(handle.id, driver, body);
        const device = backend?.config?.device?.name;
        io.success(`Mounted '${name}' as ${backend.driver}/${backend.address}${device ? ` on device ${device}` : ''}${backend.treePath ? ` (tree: ${backend.treePath})` : ''}`);
        io.info('Initial scan runs in the background — check progress with: ws backends list');
    },
};

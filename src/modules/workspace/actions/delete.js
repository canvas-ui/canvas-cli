'use strict';

import { resolveWorkspaceHandle } from '../lib/handle.js';

export default {
    name: 'delete',
    aliases: ['destroy', 'rm'],
    description: 'Delete a workspace',
    positional: [{ name: 'address' }],
    flags: { force: 'boolean' },
    async run(ctx) {
        const { flags, io } = ctx;
        const handle = resolveWorkspaceHandle(ctx);
        if (!flags.force) {
            io.warn(`Will delete '${handle.full}'. Pass --force.`);
            return;
        }
        await handle.api.workspaces.delete(handle.id);
        io.success(`Workspace '${handle.full}' deleted`);
    },
};

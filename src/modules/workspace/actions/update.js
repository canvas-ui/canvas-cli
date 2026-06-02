'use strict';

import { UsageError } from '../../../core/errors.js';
import { unwrapResource } from '../../../core/api-helpers.js';
import { resolveWorkspaceHandle } from '../lib/handle.js';

export default {
    name: 'update',
    description: 'Update a workspace',
    positional: [{ name: 'address' }],
    flags: { label: 'string', description: 'string', color: 'string', metadata: 'string' },
    async run(ctx) {
        const { flags, io } = ctx;
        const handle = resolveWorkspaceHandle(ctx);
        const data = {};
        for (const k of ['label', 'description', 'color']) if (flags[k]) data[k] = flags[k];
        if (flags.metadata) data.metadata = JSON.parse(flags.metadata);
        if (Object.keys(data).length === 0) {
            throw new UsageError('Nothing to update. Use --label/--description/--color/--metadata');
        }
        const ws = await handle.api.patch(`/workspaces/${handle.id}`, data);
        io.success(`Workspace '${handle.full}' updated`);
        io.output(unwrapResource(ws, 'workspace'));
    },
};

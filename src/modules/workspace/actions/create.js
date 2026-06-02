'use strict';

import { UsageError, AuthError } from '../../../core/errors.js';
import { unwrapResource } from '../../../core/api-helpers.js';

export default {
    name: 'create',
    description: 'Create a workspace',
    positional: [{ name: 'name', required: true }],
    flags: {
        label: 'string', description: 'string', type: 'string',
        color: 'string', metadata: 'string',
    },
    async run({ args, flags, client, session, io }) {
        if (!args.name) throw new UsageError('Workspace name required');
        const remoteId = session.boundRemote();
        if (!remoteId) throw new AuthError('No remote bound');
        const payload = {
            name: args.name,
            label: flags.label || args.name,
            description: flags.description || '',
            type: flags.type || 'workspace',
        };
        if (flags.color) payload.color = flags.color;
        if (flags.metadata) payload.metadata = JSON.parse(flags.metadata);
        const ws = await client.client(remoteId).workspaces.create(payload);
        io.success(`Workspace '${args.name}' created`);
        io.output(unwrapResource(ws, 'workspace'));
    },
};

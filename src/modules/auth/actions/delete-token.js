'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'delete-token',
    aliases: ['deleteToken', 'token-delete'],
    description: 'Delete API token',
    positional: [{ name: 'id' }],
    flags: { force: 'boolean' },
    needsConnection: true,
    async run({ args, flags, client, io }) {
        if (!args.id) throw new UsageError('Token id required');
        if (!flags.force) {
            io.warn(`Will delete token '${args.id}'. Pass --force.`);
            return;
        }
        await client.client().auth.tokens.delete(args.id);
        io.success(`Token '${args.id}' deleted`);
    },
};

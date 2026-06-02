'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'show',
    aliases: ['get'],
    description: 'Show role details',
    positional: [{ name: 'id', required: true }],
    async run({ args, client, session, io }) {
        if (!args.id) throw new UsageError('Role id required');
        const remoteId = session.boundRemote();
        if (!remoteId) throw new UsageError('No remote bound');
        io.output(await client.client(remoteId).roles.get(args.id));
    },
};

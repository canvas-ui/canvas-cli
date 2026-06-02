'use strict';

import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'show',
    description: 'Show remote details',
    positional: [{ name: 'id', required: true }],
    async run({ args, client, session, io }) {
        if (!args.id) throw new UsageError('Remote id required');
        const r = client.getRemote(args.id);
        if (!r) throw new NotFoundError(`Remote '${args.id}' not found`);
        io.output({
            id: args.id,
            url: r.url,
            apiBase: r.apiBase,
            version: r.version || 'Unknown',
            authMethod: r.auth?.method || 'unknown',
            hasToken: !!r.auth?.token,
            lastSynced: r.lastSynced || null,
            bound: session.boundRemote() === args.id,
        });
    },
};

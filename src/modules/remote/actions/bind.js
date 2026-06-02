'use strict';

import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'bind',
    description: 'Set default remote',
    positional: [{ name: 'id', required: true }],
    async run({ args, client, session, io }) {
        if (!args.id) throw new UsageError('Remote id required');
        const r = client.getRemote(args.id);
        if (!r) throw new NotFoundError(`Remote '${args.id}' not found`);
        session.bindRemote(args.id);
        io.success(`Bound to '${args.id}' (${r.url})`);
        try {
            await client.client(args.id).ping();
            session.update({ boundRemoteStatus: 'connected' });
        } catch (e) {
            io.warn(`Ping failed: ${e.message}`);
            session.update({ boundRemoteStatus: 'disconnected' });
        }
    },
};

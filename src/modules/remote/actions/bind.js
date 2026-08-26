'use strict';

import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'bind',
    description: 'Set default remote',
    positional: [{ name: 'id', required: true, fromResource: true }],
    async run({ args, client, session, io, parent }) {
        // `remote <id> show` (resource slot) or `remote show <id>` (positional).
        const id = parent?.remote?.id || args.id;
        if (!id) throw new UsageError('Remote id required');
        const r = client.getRemote(id);
        if (!r) throw new NotFoundError(`Remote '${id}' not found`);
        session.bindRemote(id);
        io.success(`Bound to '${id}' (${r.url})`);
        try {
            await client.client(id).ping();
            session.update({ boundRemoteStatus: 'connected' });
        } catch (e) {
            io.warn(`Ping failed: ${e.message}`);
            session.update({ boundRemoteStatus: 'disconnected' });
        }
    },
};

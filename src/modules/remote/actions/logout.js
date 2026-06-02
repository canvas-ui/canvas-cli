'use strict';

import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'logout',
    description: 'Logout from a remote',
    positional: [{ name: 'id' }],
    async run({ args, client, session, io }) {
        const id = args.id || session.boundRemote();
        if (!id) throw new UsageError('Remote id required');
        if (!client.getRemote(id)) throw new NotFoundError(`Remote '${id}' not found`);
        try { await client.client(id).auth.logout(); } catch { /* best effort */ }
        client.clearCache(id);
        client.updateRemote(id, {
            auth: { method: 'password', tokenType: 'jwt', token: '' },
        });
        io.success(`Logged out from '${id}'`);
    },
};

'use strict';

import { AuthError } from '../../../core/errors.js';

export default {
    name: 'logout',
    description: 'Logout from bound remote',
    async run({ client, session, io }) {
        const id = session.boundRemote();
        if (!id) throw new AuthError('No remote bound');
        try { await client.client(id).auth.logout(); } catch { /* best effort */ }
        client.clearCache(id);
        client.updateRemote(id, {
            auth: { method: 'password', tokenType: 'jwt', token: '' },
        });
        io.success('Logged out');
    },
};

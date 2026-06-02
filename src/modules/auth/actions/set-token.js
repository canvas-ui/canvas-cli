'use strict';

import { UsageError, AuthError } from '../../../core/errors.js';

export default {
    name: 'set-token',
    aliases: ['setToken', 'token-set'],
    description: 'Set API token on bound remote',
    positional: [{ name: 'token' }],
    flags: { token: 'string' },
    async run({ args, flags, client, session, io }) {
        const token = args.token || flags.token;
        if (!token) throw new UsageError('Token required');
        if (!token.startsWith('canvas-')) throw new UsageError('Canvas tokens start with "canvas-"');
        const id = session.boundRemote();
        if (!id) throw new AuthError('No remote bound');
        client.updateRemote(id, {
            auth: { method: 'token', tokenType: 'jwt', token },
        });
        client.clearCache(id);
        io.success('API token set');
        try {
            await client.client(id).ping();
            io.success('Token valid, server reachable');
        } catch {
            io.warn('Token may be invalid or server unreachable');
        }
    },
};

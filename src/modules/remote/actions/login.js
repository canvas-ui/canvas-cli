'use strict';

import { input, password } from '../../../core/prompt.js';
import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'login',
    description: 'Login to a remote',
    positional: [{ name: 'id' }],
    flags: { token: 'string', email: 'string', username: 'string', password: 'string' },
    async run({ args, flags, client, session, io }) {
        const id = args.id || session.boundRemote();
        if (!id) throw new UsageError('Remote id required');
        const r = client.getRemote(id);
        if (!r) throw new NotFoundError(`Remote '${id}' not found`);

        if (flags.token) {
            client.updateRemote(id, {
                auth: { method: 'token', tokenType: 'jwt', token: flags.token },
            });
            io.success(`Logged into '${id}' with token`);
            return;
        }

        let email = flags.email || flags.username;
        if (!email) email = await input('Email: ');
        if (!email) throw new UsageError('Email required');

        let pw = flags.password;
        if (!pw) pw = await password('Password: ');
        if (!pw) throw new UsageError('Password required');

        client.clearCache(id);
        const result = await client.client(id).auth.login({ email, password: pw });
        const token = result?.token;
        const user = result?.user;
        if (!token) throw new UsageError('Login response missing token');

        client.updateRemote(id, {
            auth: { method: 'token', tokenType: 'jwt', token },
        });
        io.success(`Logged in as ${user?.name || user?.email || email}`);
    },
};

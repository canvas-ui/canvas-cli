'use strict';

import { input, password } from '../../../core/prompt.js';
import { UsageError, AuthError } from '../../../core/errors.js';

export default {
    name: 'login',
    description: 'Login with email/password to bound remote',
    positional: [{ name: 'email' }],
    flags: { password: 'string', email: 'string', username: 'string' },
    async run({ args, flags, client, session, io }) {
        const id = session.boundRemote();
        if (!id) throw new AuthError('No remote bound');

        let email = args.email || flags.email || flags.username;
        if (!email) email = await input('Email: ');
        if (!email) throw new UsageError('Email required');

        let pw = flags.password;
        if (!pw) pw = await password('Password: ');
        if (!pw) throw new UsageError('Password required');

        client.clearCache(id);
        const result = await client.client(id).auth.login({ email, password: pw });
        const token = result?.token;
        const user = result?.user;
        if (!token) throw new AuthError('Login response missing token');

        client.updateRemote(id, {
            auth: { method: 'token', tokenType: 'jwt', token },
        });
        io.success(`Logged in as ${user?.name || user?.email || email}`);
    },
};

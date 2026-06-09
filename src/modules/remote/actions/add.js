'use strict';

import { parseRemoteIdentifier } from '../../../core/transport/address.js';
import { input, password } from '../../../core/prompt.js';
import { UsageError, CanvasError } from '../../../core/errors.js';
import { ensureDeviceRegistered } from '../../../core/device-registration.js';

export default {
    name: 'add',
    description: 'Add a remote',
    positional: [{ name: 'id', required: true }, { name: 'url', required: true }],
    flags: { token: 'string', apiBase: 'string' },
    async run({ args, flags, client, session, io }) {
        if (!args.id) throw new UsageError('Remote identifier required (user@remote)');
        if (!args.url) throw new UsageError('Remote URL required');
        if (!parseRemoteIdentifier(args.id)) {
            throw new UsageError('Invalid format. Use: user@remote-name');
        }
        try { new URL(args.url); } catch { throw new UsageError(`Invalid URL: ${args.url}`); }

        if (client.getRemote(args.id)) {
            throw new CanvasError(`Remote '${args.id}' exists. Remove it first.`);
        }

        const isFirst = Object.keys(client.remotes()).length === 0;

        let token = flags.token;
        if (token === '' || token === true) token = await password('API token: ');

        const cfg = {
            url: args.url,
            apiBase: flags.apiBase || '/rest/v2',
            version: null,
            auth: { method: token ? 'token' : 'password', tokenType: 'jwt', token: token || '' },
        };

        io.info(`Testing '${args.id}'...`);
        try {
            const c = client.createTransient(cfg);
            const info = await c.ping();
            if (info?.version) {
                cfg.version = info.version;
                io.success(`Connected — v${info.version}`);
            } else {
                io.success('Connected');
            }
        } catch (e) {
            io.warn(`Connection test failed: ${e.message}`);
        }

        client.saveRemote(args.id, cfg);
        io.success(`Remote '${args.id}' added`);

        if (isFirst) {
            session.bindRemote(args.id);
            io.success('Set as default remote (first remote)');
        }

        if (!token) {
            // No token supplied — run login flow automatically.
            io.print('');
            token = await _login(args.id, client, io);
        }

        if (token) {
            try {
                await ensureDeviceRegistered(args.id, client, io);
            } catch (e) {
                io.warn(`Device registration skipped: ${e.message}`);
            }
        }
    },
};

async function _login(remoteId, client, io) {
    io.print('Login required. Use --token to skip interactive login.');
    const email = await input('Email: ');
    if (!email) { io.warn('Login skipped'); return null; }
    const pw = await password('Password: ');
    if (!pw) { io.warn('Login skipped'); return null; }

    try {
        client.clearCache(remoteId);
        const result = await client.client(remoteId).auth.login({ email, password: pw });
        const token = result?.token;
        const user = result?.user;
        if (!token) { io.warn('Login failed: no token in response'); return null; }
        client.updateRemote(remoteId, { auth: { method: 'token', tokenType: 'jwt', token } });
        io.success(`Logged in as ${user?.name || user?.email || email}`);
        return token;
    } catch (e) {
        io.warn(`Login failed: ${e.message}`);
        return null;
    }
}

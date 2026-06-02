'use strict';

import { parseRemoteIdentifier } from '../../../core/transport/address.js';
import { password } from '../../../core/prompt.js';
import { UsageError, CanvasError } from '../../../core/errors.js';

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
    },
};

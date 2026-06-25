'use strict';

import { input, password } from '../../../core/prompt.js';
import { UsageError, NotFoundError } from '../../../core/errors.js';
import { ensureDeviceRegistered } from '../../../core/device-registration.js';

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
            await _registerDevice(id, client, io);
            await _postLoginSync(id, client, io);
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
        await _registerDevice(id, client, io);
        await _postLoginSync(id, client, io);
    },
};

async function _registerDevice(remoteId, client, io) {
    try {
        await ensureDeviceRegistered(remoteId, client, io);
    } catch (e) {
        io.warn(`Device registration skipped: ${e.message}`);
    }
}

async function _postLoginSync(remoteId, client, io) {
    try {
        client.clearCache(remoteId);
        const info = await client.ping(remoteId);
        client.updateRemote(remoteId, {
            version: info?.version || null,
            lastSynced: new Date().toISOString(),
        });
        io.info(`Synced${info?.version ? ` (v${info.version})` : ''}`);
    } catch (e) {
        io.warn(`Sync failed: ${e.message}`);
    }

    try {
        const wList = await client.client(remoteId).workspaces.list();
        const workspaces = (Array.isArray(wList) ? wList : wList?.workspaces || [])
            .map((w) => ({ id: w.id || w.name, label: w.label || w.name, type: w.type, status: w.status }));
        if (workspaces.length) {
            io.print('');
            io.output(workspaces, { columns: ['id', 'label', 'type', 'status'] });
        }
    } catch (e) {
        io.warn(`Could not list workspaces: ${e.message}`);
    }

    try {
        const cList = await client.client(remoteId).contexts.list();
        const contexts = (Array.isArray(cList) ? cList : cList?.contexts || [])
            .map((c) => ({ id: c.id, description: c.description, url: c.url }));
        if (contexts.length) {
            io.print('');
            io.output(contexts, { columns: ['id', 'description', 'url'] });
        }
    } catch (e) {
        io.warn(`Could not list contexts: ${e.message}`);
    }
}

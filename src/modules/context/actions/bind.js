'use strict';

import { UsageError } from '../../../core/errors.js';
import { isNetworkError } from '@augmentd-labs/canvas-api-client';

export default {
    name: 'bind',
    aliases: ['switch'],
    description: 'Bind to a context',
    needsConnection: false,
    positional: [{ name: 'id' }],
    async run({ parent, args, rest, client, session, io }) {
        let handle = parent.context;
        if (!handle) {
            const raw = args.id || (rest && rest[0]);
            if (!raw) throw new UsageError('Context address required (id or user@remote:id)');
            handle = client.resolve(raw);
        }
        const { id, full, api, remoteId } = handle;
        let url = null;
        // Fetching the context is proof of reachability either way, so record
        // it: the shell prompt reads boundRemoteStatus, and `remote bind` used
        // to be the only command that ever wrote it.
        const isBoundRemote = !remoteId || remoteId === session.boundRemote();
        try {
            const ctx = await api.contexts.get(id);
            const c = ctx?.context || ctx;
            url = c?.url || null;
            if (isBoundRemote) session.update({ boundRemoteStatus: 'connected' });
        } catch (e) {
            // The server answering with an error (a workspace that won't start,
            // a missing context) still proves it is reachable — only a network
            // failure means disconnected.
            if (isBoundRemote) {
                session.update({ boundRemoteStatus: isNetworkError(e) ? 'disconnected' : 'connected' });
            }
            io.warn(`Could not fetch context: ${e.message}`);
        }
        session.update({
            boundContext: full,
            boundContextId: id,
            boundContextUrl: url,
            boundAt: new Date().toISOString(),
        });
        io.success(`Switched to context '${full}'`);
    },
};

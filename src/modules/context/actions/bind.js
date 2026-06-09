'use strict';

import { UsageError } from '../../../core/errors.js';

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
        const { id, full, api } = handle;
        let url = null;
        try {
            const ctx = await api.contexts.get(id);
            const c = ctx?.context || ctx;
            url = c?.url || null;
        } catch (e) {
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

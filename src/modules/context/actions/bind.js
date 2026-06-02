'use strict';

import { UsageError } from '../../../core/errors.js';
import { resolveAlias } from '../../../core/storage.js';

export default {
    name: 'bind',
    aliases: ['switch'],
    description: 'Bind to a context',
    needsConnection: false,
    async run({ parent, client, session, io }) {
        if (!parent.context) throw new UsageError('Context address required');
        const { id, full, api } = parent.context;
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
        void resolveAlias;
    },
};

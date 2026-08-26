'use strict';

import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'show',
    description: 'Show remote details',
    positional: [{ name: 'id', required: true, fromResource: true }],
    async run({ args, client, session, io, parent }) {
        // `remote <id> show` (resource slot) or `remote show <id>` (positional).
        const id = parent?.remote?.id || args.id;
        if (!id) throw new UsageError('Remote id required');
        const r = client.getRemote(id);
        if (!r) throw new NotFoundError(`Remote '${id}' not found`);
        io.detail({
            id: id,
            url: r.url,
            apiBase: r.apiBase,
            version: r.version || 'Unknown',
            authMethod: r.auth?.method || 'unknown',
            hasToken: !!r.auth?.token,
            lastSynced: r.lastSynced || null,
            bound: session.boundRemote() === id,
        }, {
            columns: [
                'id', 'url', 'apiBase', 'version',
                { key: 'authMethod', label: 'auth' },
                { key: 'hasToken', label: 'token', format: 'bool' },
                { key: 'lastSynced', label: 'synced', format: 'date' },
                { key: 'bound', label: 'bound', format: 'bool' },
            ],
        });
    },
};

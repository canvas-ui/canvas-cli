'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'list',
    description: 'List agents on bound remote',
    async run({ client, session, io }) {
        const remoteId = session.boundRemote();
        if (!remoteId) throw new UsageError('No remote bound');
        const list = await client.client(remoteId).agents.list();
        const rows = (Array.isArray(list) ? list : list?.agents || []).map((a) => ({
            remote: remoteId,
            name: a.name || a.id,
            label: a.label,
            status: a.status,
            llmProvider: a.llmProvider,
            model: a.model,
        }));
        io.output(rows, { columns: ['remote', 'name', 'label', 'status', 'llmProvider', 'model'] });
    },
};

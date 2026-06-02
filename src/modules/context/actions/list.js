'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'list',
    description: 'List contexts on bound remote',
    needsConnection: false,
    async run({ client, session, io }) {
        const remoteId = session.boundRemote();
        if (!remoteId) throw new UsageError('No remote bound');
        const list = await client.client(remoteId).contexts.list();
        const rows = (Array.isArray(list) ? list : list?.contexts || [])
            .map((c) => ({
                remote: remoteId,
                id: c.id,
                description: c.description,
                url: c.url,
            }));
        io.output(rows, { columns: ['remote', 'id', 'description', 'url'] });
    },
};

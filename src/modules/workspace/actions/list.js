'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'list',
    description: 'List workspaces on bound remote',
    needsConnection: false,
    async run({ client, session, io }) {
        const remoteId = session.boundRemote();
        if (!remoteId) throw new UsageError('No remote bound. `canvas remote bind <id>`');
        const list = await client.client(remoteId).workspaces.list();
        const rows = (Array.isArray(list) ? list : list?.workspaces || [])
            .map((w) => ({
                remote: remoteId,
                id: w.id || w.name,
                label: w.label || w.name,
                type: w.type,
                status: w.status,
            }));
        io.output(rows, { columns: ['remote', 'id', 'label', 'type', 'status'] });
    },
};

'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'list',
    description: 'List roles on bound remote',
    async run({ client, session, io }) {
        const remoteId = session.boundRemote();
        if (!remoteId) throw new UsageError('No remote bound');
        const list = await client.client(remoteId).roles.list();
        io.output(Array.isArray(list) ? list : list?.roles || []);
    },
};

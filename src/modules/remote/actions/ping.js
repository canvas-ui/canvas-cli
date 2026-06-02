'use strict';

import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'ping',
    description: 'Test reachability',
    positional: [{ name: 'id' }],
    async run({ args, client, session, io }) {
        const id = args.id || session.boundRemote();
        if (!id) throw new UsageError('Remote id required');
        if (!client.getRemote(id)) throw new NotFoundError(`Remote '${id}' not found`);
        client.clearCache(id);
        const start = Date.now();
        const info = await client.ping(id);
        io.success(`'${id}' reachable (${Date.now() - start}ms)`);
        if (info) io.output(info);
    },
};

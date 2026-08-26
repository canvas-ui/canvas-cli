'use strict';

import { UsageError, NotFoundError } from '../../../core/errors.js';
import { isNetworkError } from '@augmentd-labs/canvas-api-client';

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
        const isBoundRemote = id === session.boundRemote();
        let info;
        try {
            info = await client.ping(id);
        } catch (e) {
            if (isBoundRemote && isNetworkError(e)) session.update({ boundRemoteStatus: 'disconnected' });
            throw e;
        }
        if (isBoundRemote) session.update({ boundRemoteStatus: 'connected' });
        io.success(`'${id}' reachable (${Date.now() - start}ms)`);
        if (info) io.output(info);
    },
};

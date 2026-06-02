'use strict';

import { parseRemoteIdentifier } from '../../../core/transport/address.js';
import { UsageError, NotFoundError, CanvasError } from '../../../core/errors.js';

export default {
    name: 'rename',
    description: 'Rename a remote',
    positional: [{ name: 'oldId', required: true }, { name: 'newId', required: true }],
    async run({ args, client, session, io }) {
        const { oldId, newId } = args;
        if (!oldId || !newId) throw new UsageError('Old and new identifiers required');
        if (!parseRemoteIdentifier(newId)) throw new UsageError('Invalid new identifier');
        const old = client.getRemote(oldId);
        if (!old) throw new NotFoundError(`Remote '${oldId}' not found`);
        if (client.getRemote(newId)) throw new CanvasError(`Remote '${newId}' already exists`);
        client.saveRemote(newId, old);
        client.removeRemote(oldId);
        if (session.boundRemote() === oldId) session.bindRemote(newId);
        io.success(`Renamed '${oldId}' → '${newId}'`);
    },
};

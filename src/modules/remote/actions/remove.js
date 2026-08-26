'use strict';

import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'remove',
    aliases: ['rm', 'delete'],
    description: 'Remove a remote',
    positional: [{ name: 'id', required: true, fromResource: true }],
    flags: { force: 'boolean' },
    async run({ args, flags, client, session, io, parent }) {
        // `remote <id> show` (resource slot) or `remote show <id>` (positional).
        const id = parent?.remote?.id || args.id;
        if (!id) throw new UsageError('Remote id required');
        if (!flags.force) {
            io.warn(`Will remove '${id}'. Pass --force to confirm.`);
            return;
        }
        if (!client.getRemote(id)) throw new NotFoundError(`Remote '${id}' not found`);
        client.removeRemote(id);
        if (session.boundRemote() === id) {
            session.update({
                boundRemote: null, boundContext: null, boundContextId: null,
                boundContextUrl: null, boundAt: null,
            });
        }
        io.success(`Remote '${id}' removed`);
    },
};

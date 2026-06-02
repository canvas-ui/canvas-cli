'use strict';

import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'remove',
    aliases: ['rm', 'delete'],
    description: 'Remove a remote',
    positional: [{ name: 'id', required: true }],
    flags: { force: 'boolean' },
    async run({ args, flags, client, session, io }) {
        if (!args.id) throw new UsageError('Remote id required');
        if (!flags.force) {
            io.warn(`Will remove '${args.id}'. Pass --force to confirm.`);
            return;
        }
        if (!client.getRemote(args.id)) throw new NotFoundError(`Remote '${args.id}' not found`);
        client.removeRemote(args.id);
        if (session.boundRemote() === args.id) {
            session.update({
                boundRemote: null, boundContext: null, boundContextId: null,
                boundContextUrl: null, boundAt: null,
            });
        }
        io.success(`Remote '${args.id}' removed`);
    },
};

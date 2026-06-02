'use strict';

import { aliases as store } from '../../../core/storage.js';
import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'remove',
    aliases: ['rm', 'delete'],
    description: 'Remove alias',
    positional: [{ name: 'name', required: true }],
    flags: { force: 'boolean' },
    async run({ args, flags, io }) {
        if (!args.name) throw new UsageError('Alias name required');
        if (!flags.force) {
            io.warn(`Will remove alias '${args.name}'. Pass --force.`);
            return;
        }
        if (!store.has(args.name)) throw new NotFoundError(`Alias '${args.name}' not found`);
        store.delete(args.name);
        io.success(`Alias '${args.name}' removed`);
    },
};

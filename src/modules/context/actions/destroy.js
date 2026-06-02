'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'destroy',
    aliases: ['delete', 'rm'],
    description: 'Destroy a context',
    flags: { force: 'boolean' },
    async run({ parent, flags, io }) {
        if (!parent.context) throw new UsageError('Context address required');
        if (!flags.force) {
            io.warn(`Will destroy '${parent.context.full}'. Pass --force.`);
            return;
        }
        await parent.context.api.contexts.delete(parent.context.id);
        io.success(`Context '${parent.context.full}' destroyed`);
    },
};

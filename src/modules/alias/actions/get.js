'use strict';

import { aliases as store } from '../../../core/storage.js';
import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'get',
    description: 'Resolve alias to address',
    positional: [{ name: 'name', required: true }],
    async run({ args, io }) {
        if (!args.name) throw new UsageError('Alias name required');
        const a = store.get(args.name);
        if (!a) throw new NotFoundError(`Alias '${args.name}' not found`);
        io.print(a.address);
    },
};

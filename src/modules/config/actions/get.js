'use strict';

import { config } from '../../../core/storage.js';
import { UsageError } from '../../../core/errors.js';
import { getPath } from './show.js';

export default {
    name: 'get',
    description: 'Get value by key',
    positional: [{ name: 'key', required: true }],
    async run({ args, io }) {
        if (!args.key) throw new UsageError('Key required');
        const v = getPath(config.read(), args.key);
        if (v === undefined) throw new UsageError(`Key '${args.key}' not found`);
        io.output(v);
    },
};

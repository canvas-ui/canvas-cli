'use strict';

import { config } from '../../../core/storage.js';
import { UsageError } from '../../../core/errors.js';
import { deletePath } from './show.js';

export default {
    name: 'delete',
    aliases: ['del', 'remove'],
    description: 'Delete a key',
    positional: [{ name: 'key', required: true }],
    flags: { force: 'boolean' },
    async run({ args, flags, io }) {
        if (!args.key) throw new UsageError('Key required');
        if (!flags.force) {
            io.warn(`Will delete '${args.key}'. Pass --force to confirm.`);
            return;
        }
        const data = config.read();
        if (!deletePath(data, args.key)) throw new UsageError(`Key '${args.key}' not found`);
        config.write(data);
        io.success(`Deleted '${args.key}'`);
    },
};

'use strict';

import { config } from '../../../core/storage.js';
import { UsageError } from '../../../core/errors.js';
import { setPath } from './show.js';

export default {
    name: 'set',
    description: 'Set value by key',
    positional: [{ name: 'key', required: true }, { name: 'value', required: true }],
    async run({ args, io }) {
        if (!args.key) throw new UsageError('Key required');
        if (args.value === undefined) throw new UsageError('Value required');
        let value;
        try { value = JSON.parse(args.value); } catch { value = args.value; }
        const data = config.read();
        setPath(data, args.key, value);
        config.write(data);
        io.success(`${args.key} = ${JSON.stringify(value)}`);
    },
};

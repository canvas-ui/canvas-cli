'use strict';

import { aliases as store } from '../../../core/storage.js';
import { isValidResourceAddress } from '../../../core/transport/address.js';
import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'update',
    description: 'Update existing alias',
    positional: [{ name: 'name', required: true }, { name: 'address', required: true }],
    async run({ args, io }) {
        const { name, address } = args;
        if (!name) throw new UsageError('Alias name required');
        if (!address) throw new UsageError('Address required');
        if (address.includes('@') && address.includes(':') && !isValidResourceAddress(address)) {
            throw new UsageError('Invalid address');
        }
        const existing = store.get(name);
        if (!existing) throw new NotFoundError(`Alias '${name}' not found`);
        store.set(name, { ...existing, address, updatedAt: new Date().toISOString() });
        io.success(`Alias '${name}' → '${address}'`);
    },
};

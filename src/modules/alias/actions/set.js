'use strict';

import { aliases as store } from '../../../core/storage.js';
import { isValidResourceAddress } from '../../../core/transport/address.js';
import { UsageError } from '../../../core/errors.js';

const RESERVED = ['remote', 'context', 'workspace', 'alias', 'auth', 'config', 'agent', 'role', 'dot', 'help', 'version'];

export default {
    name: 'set',
    description: 'Create or overwrite alias',
    positional: [{ name: 'name', required: true }, { name: 'address', required: true }],
    flags: { force: 'boolean' },
    async run({ args, flags, io }) {
        const { name, address } = args;
        if (!name) throw new UsageError('Alias name required');
        if (!address) throw new UsageError('Address required');
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            throw new UsageError('Alias name: letters, numbers, underscores, hyphens only');
        }
        if (RESERVED.includes(name.toLowerCase())) {
            throw new UsageError(`'${name}' is reserved`);
        }
        if (address.includes('@') && address.includes(':') && !isValidResourceAddress(address)) {
            throw new UsageError('Invalid address. Use: user@remote:resource');
        }
        const existing = store.get(name);
        if (existing && !flags.force) {
            io.warn(`Alias '${name}' exists → ${existing.address}. Pass --force.`);
            return;
        }
        const now = new Date().toISOString();
        store.set(name, {
            address,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
        });
        io.success(`Alias '${name}' → '${address}'`);
    },
};

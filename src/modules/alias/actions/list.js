'use strict';

import { aliases as store } from '../../../core/storage.js';

export default {
    name: 'list',
    description: 'List aliases',
    async run({ io }) {
        const entries = store.entries();
        if (entries.length === 0) {
            io.warn('No aliases configured');
            io.info('Create one: canvas alias set <name> <address>');
            return;
        }
        io.output(entries.map(([name, cfg]) => ({
            alias: name,
            address: cfg.address,
            created: cfg.createdAt,
        })));
    },
};

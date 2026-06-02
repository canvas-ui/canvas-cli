'use strict';

import { config } from '../../../core/storage.js';

function flatten(obj, prefix = '') {
    const keys = [];
    for (const k of Object.keys(obj || {})) {
        const full = prefix ? `${prefix}.${k}` : k;
        const v = obj[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...flatten(v, full));
        else keys.push({ key: full, type: Array.isArray(v) ? 'array' : typeof v });
    }
    return keys;
}

export default {
    name: 'list',
    description: 'List all keys',
    async run({ io }) {
        const keys = flatten(config.read());
        if (keys.length === 0) { io.info('No keys'); return; }
        io.output(keys, { columns: ['key', 'type'] });
    },
};

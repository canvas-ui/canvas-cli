'use strict';

import { config } from '../../../core/storage.js';
import { UsageError } from '../../../core/errors.js';

export default {
    name: 'show',
    description: 'Show config (all or specific key)',
    positional: [{ name: 'key' }],
    async run({ args, io }) {
        if (args.key) {
            const value = getPath(config.read(), args.key);
            if (value === undefined) throw new UsageError(`Key '${args.key}' not found`);
            io.output({ [args.key]: value });
            return;
        }
        io.output(config.read());
        io.info(`Config file: ${config.path}`);
    },
};

export function getPath(obj, dotted) {
    return dotted.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
}

export function setPath(obj, dotted, value) {
    const parts = dotted.split('.');
    const last = parts.pop();
    let cur = obj;
    for (const p of parts) {
        if (typeof cur[p] !== 'object' || cur[p] == null) cur[p] = {};
        cur = cur[p];
    }
    cur[last] = value;
    return obj;
}

export function deletePath(obj, dotted) {
    const parts = dotted.split('.');
    const last = parts.pop();
    let cur = obj;
    for (const p of parts) {
        if (typeof cur[p] !== 'object' || cur[p] == null) return false;
        cur = cur[p];
    }
    if (!(last in cur)) return false;
    delete cur[last];
    return true;
}

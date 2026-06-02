'use strict';

import { config } from '../../../core/storage.js';
import { CanvasError } from '../../../core/errors.js';

export default {
    name: 'validate',
    description: 'Validate config',
    async run({ io }) {
        const cfg = config.read();
        const errors = [];
        if (cfg.server?.url) {
            try { new URL(cfg.server.url); } catch { errors.push('server.url invalid'); }
        }
        if (errors.length === 0) { io.success('Configuration is valid'); return; }
        for (const e of errors) io.error(`- ${e}`);
        throw new CanvasError('Validation failed');
    },
};

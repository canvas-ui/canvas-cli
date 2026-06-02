'use strict';

import { spawn } from 'node:child_process';
import { getProcessInfo, hasPM2, PM2_APP } from '../lib/pm2.js';
import { CanvasError } from '../../../core/errors.js';

export default {
    name: 'logs',
    description: 'Stream server logs',
    flags: { lines: 'string' },
    async run({ flags, io }) {
        if (!(await hasPM2())) throw new CanvasError('PM2 not installed');
        const info = await getProcessInfo();
        if (!info) { io.warn('Server not running'); return; }
        const lines = flags.lines || '50';
        return new Promise((resolve) => {
            const p = spawn('pm2', ['logs', PM2_APP, '--lines', lines], { stdio: 'inherit' });
            process.on('SIGINT', () => p.kill('SIGINT'));
            p.on('close', () => resolve());
        });
    },
};

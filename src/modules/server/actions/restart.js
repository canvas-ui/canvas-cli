'use strict';

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getProcessInfo, hasPM2, PM2_APP } from '../lib/pm2.js';
import startAction from './start.js';
import { CanvasError } from '../../../core/errors.js';

const execAsync = promisify(exec);

export default {
    name: 'restart',
    description: 'Restart Canvas server',
    async run(ctx) {
        if (!(await hasPM2())) throw new CanvasError('PM2 not installed');
        const info = await getProcessInfo();
        if (!info) { ctx.io.warn('Server not running, starting...'); return startAction.run(ctx); }
        await execAsync(`pm2 restart ${PM2_APP}`);
        ctx.io.success('Canvas server restarted');
    },
};

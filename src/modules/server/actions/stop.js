'use strict';

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getProcessInfo, hasPM2, PM2_APP } from '../lib/pm2.js';
import { CanvasError } from '../../../core/errors.js';

const execAsync = promisify(exec);

export default {
    name: 'stop',
    description: 'Stop Canvas server',
    async run({ io }) {
        if (!(await hasPM2())) throw new CanvasError('PM2 not installed');
        const info = await getProcessInfo();
        if (!info) { io.warn('Server not running'); return; }
        await execAsync(`pm2 stop ${PM2_APP}`);
        await execAsync(`pm2 delete ${PM2_APP}`);
        io.success('Canvas server stopped');
    },
};

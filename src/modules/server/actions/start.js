'use strict';

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { findServerRoot, getProcessInfo, hasPM2, PM2_APP } from '../lib/pm2.js';
import { CanvasError } from '../../../core/errors.js';

const execAsync = promisify(exec);

export default {
    name: 'start',
    description: 'Start Canvas server via PM2',
    async run({ io }) {
        const root = findServerRoot();
        if (!root) throw new CanvasError('Canvas server root not found. Set CANVAS_SERVER_ROOT.');
        if (!(await hasPM2())) throw new CanvasError('PM2 not installed. `npm install -g pm2`');
        const existing = await getProcessInfo();
        if (existing && existing.pm2_env.status === 'online') {
            io.warn('Canvas server already running');
            return;
        }
        const script = path.join(root, 'src/Server.js');
        const cfg = {
            name: PM2_APP, script, cwd: root,
            env: { NODE_ENV: 'development', ...process.env },
            time: true, autorestart: true, max_restarts: 5, min_uptime: '10s',
        };
        await execAsync(`pm2 start '${JSON.stringify(cfg).replace(/'/g, '\\\'')}'`);
        io.success('Canvas server started');
    },
};

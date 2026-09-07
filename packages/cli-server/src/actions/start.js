'use strict';

import path from 'node:path';
import { findServerRoot, getProcessInfo, hasPM2, PM2_APP, pm2Env, pm2Start } from '../lib/pm2.js';
import { CanvasError } from '@augmentd-labs/canvas-cli-host/errors';


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
        // The package entry point; src/Server.js only exports the singleton.
        const script = path.join(root, 'src/init.js');
        const cfg = {
            name: PM2_APP, script, cwd: root,
            env: pm2Env({ NODE_ENV: 'development' }),
            time: true, autorestart: true, max_restarts: 5, min_uptime: '10s',
        };
        await pm2Start(cfg);
        io.success('Canvas server started');
    },
};

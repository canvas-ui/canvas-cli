'use strict';

import install from './actions/install.js';
import logs from './actions/logs.js';
import restart from './actions/restart.js';
import start from './actions/start.js';
import status from './actions/status.js';
import stop from './actions/stop.js';

/*
 * @augmentd-labs/canvas-cli-server — the `canvas server` module: a local
 * canvas-server under pm2 (clone into ~/.canvas/server, start/stop/logs).
 * Fetched on demand by the core CLI (`canvas package install server`).
 */
export default {
    name: 'server',
    description: 'Manage local Canvas server (PM2)',
    defaultAction: 'status',
    needsConnection: false,
    actions: [install, logs, restart, start, status, stop],
    submodules: [],
};

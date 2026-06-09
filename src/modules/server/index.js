'use strict';

import logs from './actions/logs.js';
import restart from './actions/restart.js';
import start from './actions/start.js';
import status from './actions/status.js';
import stop from './actions/stop.js';

export default {
    name: 'server',
    description: 'Manage local Canvas server (PM2)',
    defaultAction: 'status',
    needsConnection: false,
    actions: [logs, restart, start, status, stop],
    submodules: [],
};

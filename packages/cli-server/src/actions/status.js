'use strict';

import { findServerRoot, getProcessInfo, formatUptime, formatMemory } from '../lib/pm2.js';

export default {
    name: 'status',
    description: 'Show local server status',
    async run({ client, session, io }) {
        const root = findServerRoot();
        io.print(`Server root: ${root || 'not found'}`);
        const info = await getProcessInfo();
        if (info) {
            io.output({
                pm2Status: info.pm2_env.status,
                pid: info.pid,
                uptime: formatUptime(info.pm2_env.pm_uptime),
                restarts: info.pm2_env.restart_time,
                memory: formatMemory(info.monit?.memory),
                cpu: `${info.monit?.cpu || 0}%`,
            });
        } else {
            io.warn('PM2 process: stopped');
        }
        const remoteId = session.boundRemote();
        if (remoteId) {
            try {
                const api = await client.client(remoteId).ping();
                io.success(`API reachable (v${api?.version || '?'})`);
            } catch (e) {
                io.warn(`API unreachable: ${e.message}`);
            }
        }
    },
};

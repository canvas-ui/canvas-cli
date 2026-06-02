'use strict';

import chalk from 'chalk';

function status(cfg) {
    if (!cfg.auth?.token) return 'no-token';
    if (!cfg.lastSynced) return 'unknown';
    const hours = (Date.now() - new Date(cfg.lastSynced).getTime()) / 3600000;
    if (hours < 1) return 'synced';
    if (hours < 24) return 'stale';
    return 'old';
}

export default {
    name: 'list',
    description: 'List configured remotes',
    async run({ client, session, io }) {
        const remotes = client.remotes();
        const ids = Object.keys(remotes);
        if (ids.length === 0) {
            io.warn('No remotes configured');
            io.info('Add: canvas remote add user@name https://url');
            return;
        }
        const bound = session.boundRemote();
        const rows = ids.map((id) => ({
            id,
            url: remotes[id].url,
            version: remotes[id].version || '-',
            auth: remotes[id].auth?.method || '-',
            status: status(remotes[id]),
            bound: bound === id ? '*' : '',
        }));
        io.output(rows, { columns: ['bound', 'id', 'url', 'version', 'auth', 'status'] });
        if (bound) io.info(`Default: ${chalk.cyan(bound)}`);
    },
};

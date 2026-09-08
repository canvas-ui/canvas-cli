'use strict';

import { plan } from '../lib.js';

export default {
    name: 'check',
    aliases: ['status'],
    description: 'Report what is installed and what is available, change nothing (`--to <version>` targets a specific CLI release)',
    positional: [{ name: 'target', required: false }],
    flags: { to: 'string' },
    async run({ args, flags, io }) {
        const rows = await plan({ target: args.target, to: flags.to || null });
        io.output(rows.map(({ component, installed, latest, status, where }) => ({ component, installed, latest: latest || '-', status, where })), { columns: ['component', 'installed', 'latest', 'status', 'where'] });
        const pending = rows.filter((r) => r.pending);
        if (pending.length) io.info(`${pending.length} update(s) available — \`canvas update\` applies them.`);
        else io.info('Everything is up to date.');
    },
};

'use strict';

import * as packages from '../../../core/packages.js';

export default {
    name: 'list',
    aliases: ['ls', 'status'],
    description: 'Packages, where they come from and whether they are installed',
    async run({ io }) {
        const rows = packages.keys().map((key) => {
            const c = packages.CATALOG[key];
            const where = packages.locate(key);
            return {
                package: key,
                status: where ? (where.source === 'dev' ? 'workspace' : `installed ${where.version || ''}${where.rev ? ` (main@${where.rev})` : ''}`) : 'not installed',
                commands: c.commands.join(', '),
                size: c.size,
                source: where?.source === 'dev' ? where.dir : packages.spec(key),
            };
        });
        io.output(rows, { columns: ['package', 'status', 'commands', 'size', 'source'] });
    },
};

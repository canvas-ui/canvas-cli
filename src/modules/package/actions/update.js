'use strict';

import { UsageError } from '../../../core/errors.js';
import { spinner } from '../../../core/prompt.js';
import * as packages from '../../../core/packages.js';

export default {
    name: 'update',
    aliases: ['upgrade'],
    description: 'Pull the latest published version of an installed package (or `all`)',
    positional: [{ name: 'package', required: false }],
    async run({ args, io }) {
        const wanted = !args.package || args.package === 'all' ? packages.keys() : [String(args.package)];
        let n = 0;
        for (const key of wanted) {
            if (!packages.CATALOG[key]) throw new UsageError(`Unknown package '${key}' — one of: ${packages.keys().join(', ')}`);
            const where = packages.locate(key);
            if (!where || where.source === 'dev') { if (args.package) io.info(`${key}: ${where ? 'workspace copy, nothing to update' : 'not installed'}`); continue; }
            const before = where.rev || where.version;
            const s = spinner();
            s.start(`Updating ${key}…`);
            try { await packages.install(key, { update: true }); } catch (err) { s.stop(`${key}: update failed`); throw err; }
            const after = packages.locate(key);
            s.stop(`${key}: ${before} → ${after?.rev || after?.version}`);
            n++;
        }
        if (n === 0) io.info('Nothing to update.');
    },
};

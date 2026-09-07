'use strict';

import { UsageError } from '../../../core/errors.js';
import { spinner } from '../../../core/prompt.js';
import * as packages from '../../../core/packages.js';

export default {
    name: 'install',
    aliases: ['add'],
    description: 'Fetch a package into ~/.canvas/packages/<name> (mirror | server | desktop | all)',
    positional: [{ name: 'package', required: true }],
    async run({ args, io }) {
        const names = args.package === 'all' ? packages.keys() : [String(args.package)];
        for (const key of names) {
            if (!packages.CATALOG[key]) throw new UsageError(`Unknown package '${key}' — one of: ${packages.keys().join(', ')}, all`);
            const s = spinner();
            s.start(`Installing ${key} (${packages.spec(key)})…`);
            try {
                const dir = await packages.install(key);
                const where = packages.locate(key);
                s.stop(`${key}: ${where?.version ? `v${where.version}` : 'installed'} → ${dir}`);
            } catch (err) { s.stop(`${key}: install failed`); throw err; }
        }
        io.success(`Ready: ${names.map((k) => packages.CATALOG[k].commands[0]).map((c) => `canvas ${c}`).join(', ')}`);
    },
};

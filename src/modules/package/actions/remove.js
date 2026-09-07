'use strict';

import { rmSync } from 'node:fs';
import { UsageError } from '../../../core/errors.js';
import * as packages from '../../../core/packages.js';

export default {
    name: 'remove',
    aliases: ['rm', 'uninstall'],
    description: 'Delete an installed package (its runtimes and config are left alone)',
    positional: [{ name: 'package', required: true }],
    async run({ args, io }) {
        const key = String(args.package);
        if (!packages.CATALOG[key]) throw new UsageError(`Unknown package '${key}' — one of: ${packages.keys().join(', ')}`);
        rmSync(packages.prefix(key), { recursive: true, force: true });
        io.success(`Removed ${packages.prefix(key)}`);
    },
};

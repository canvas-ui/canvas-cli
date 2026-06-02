'use strict';

import { config } from '../../../core/storage.js';

export default {
    name: 'reset',
    description: 'Reset to defaults',
    flags: { force: 'boolean' },
    async run({ flags, io }) {
        if (!flags.force) {
            io.warn('Will reset all config. Pass --force to confirm.');
            return;
        }
        config.clear();
        io.success('Configuration reset');
    },
};

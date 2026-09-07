'use strict';

import { APP_DIR, installed } from '../lib/release.js';

export default {
    name: 'status',
    description: 'Which desktop release is downloaded',
    async run({ io }) {
        const info = installed();
        io.output({ installed: info?.tag || '-', asset: info?.asset || '-', path: info?.path || '-', dir: APP_DIR, installedAt: info?.installedAt || '-' });
    },
};

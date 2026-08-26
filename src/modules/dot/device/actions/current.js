'use strict';

import device from '../../lib/device.js';

const COLUMNS = [
    { key: 'deviceId', label: 'device' },
    { key: 'hostname', label: 'hostname' },
    { key: 'platform', label: 'platform' },
    { key: 'arch', label: 'arch' },
    { key: 'os', label: 'os' },
];

export default {
    name: 'current',
    aliases: ['this', 'show'],
    description: 'Show this machine as Canvas knows it',
    needsConnection: false,
    async run(ctx) {
        ctx.io.detail(device.info(), { columns: COLUMNS });
    },
};

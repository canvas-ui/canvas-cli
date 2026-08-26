'use strict';

import device from '../../../dot/lib/device.js';
import { resolveRemoteId } from '../lib/handle.js';

const COLUMNS = [
    { key: 'remote', label: 'remote' },
    { key: 'localDeviceId', label: 'device' },
    { key: 'hostname', label: 'hostname' },
    { label: 'registered', get: (r) => (r.registeredAs?.id ? 'yes' : 'no') },
    { label: 'registered id', get: (r) => r.registeredAs?.id, dim: true },
    { label: 'registered at', get: (r) => r.registeredAs?.registeredAt, format: 'date' },
];

export default {
    name: 'show',
    aliases: ['get', 'status'],
    description: 'Show this device as the remote knows it',
    needsConnection: false,
    positional: [{ name: 'id' }],
    async run(ctx) {
        const { id, remote } = resolveRemoteId(ctx);
        const local = device.info();
        ctx.io.detail({
            remote: id,
            localDeviceId: local.deviceId,
            hostname: local.hostname,
            registeredAs: remote.device,
        }, { columns: COLUMNS });
        if (!remote.device?.token) {
            ctx.io.info(`Not registered yet — run \`canvas remote ${id} device register\``);
        }
    },
};

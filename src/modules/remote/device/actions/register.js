'use strict';

import { ensureDeviceRegistered } from '../../../../core/device-registration.js';
import { resolveRemoteId } from '../lib/handle.js';

export default {
    name: 'register',
    aliases: ['refresh'],
    description: 'Register (or re-register) this device with the remote',
    needsConnection: false,
    positional: [{ name: 'id' }],
    async run(ctx) {
        const { id } = resolveRemoteId(ctx);
        await ensureDeviceRegistered(id, ctx.client, ctx.io, { force: true });
    },
};

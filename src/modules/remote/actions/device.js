'use strict';

import { ensureDeviceRegistered } from '../../../core/device-registration.js';
import device from '../../dot/lib/device.js';
import { UsageError, NotFoundError } from '../../../core/errors.js';

export default {
    name: 'device',
    description: 'Show or refresh device registration for a remote',
    needsConnection: false,
    positional: [{ name: 'id' }],
    flags: { refresh: 'boolean', register: 'boolean' },
    async run({ args, flags, client, session, io }) {
        const id = args.id || session.boundRemote();
        if (!id) throw new UsageError('Remote id required');
        const remote = client.getRemote(id);
        if (!remote) throw new NotFoundError(`Remote '${id}' not found`);

        const local = device.info();

        if (flags.refresh || flags.register || !remote.device?.token) {
            await ensureDeviceRegistered(id, client, io, { force: true });
            return;
        }

        io.output({
            remote: id,
            localDeviceId: local.deviceId,
            hostname: local.hostname,
            registeredAs: remote.device,
        });
    },
};

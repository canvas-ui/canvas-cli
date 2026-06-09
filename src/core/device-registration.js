'use strict';

import { select } from './prompt.js';
import device from '../modules/dot/lib/device.js';

/**
 * Ensure this machine is registered as a device on the given remote.
 * - If already registered (token stored in remote config): no-op.
 * - If local deviceId matches one on the server: re-register to refresh token.
 * - If machine is new to this remote: prompt to pick existing device or register new.
 *
 * @param {string} remoteId
 * @param {import('./transport/rest.js').CanvasClient} client
 * @param {object} io
 * @param {{ force?: boolean }} opts
 */
export async function ensureDeviceRegistered(remoteId, client, io, { force = false } = {}) {
    const remote = client.getRemote(remoteId);
    if (!force && remote?.device?.token) {
        return remote.device;
    }

    const rc = client.client(remoteId);
    const local = device.info();

    // List existing devices to detect collisions or match known device.
    let existing = [];
    try {
        const raw = await rc.auth.devices.list();
        existing = Array.isArray(raw) ? raw : raw?.documents || raw?.payload || [];
    } catch {
        // Server may not support listing or user lacks permission; proceed with register.
    }

    const match = existing.find((d) => d.deviceId === local.deviceId);

    if (existing.length === 0 || match) {
        if (match) io.info(`Device '${local.hostname}' already known. Refreshing token...`);
        else io.info('Registering this device...');
        return _register(remoteId, client, rc, io, local.deviceId, local);
    }

    // Machine is new to this remote but other devices exist — ask user.
    const choices = [
        ...existing.map((d) => ({
            label: `${d.name || d.deviceId}${d.platform ? ` [${d.platform}]` : ''}`,
            value: d.deviceId,
        })),
        { label: `Register this machine as new device (${local.hostname})`, value: '__new__' },
    ];

    const chosen = await select(
        `This machine is not registered on '${remoteId}'. Select device identity:`,
        choices,
    );

    const targetId = chosen === '__new__' ? local.deviceId : chosen;
    return _register(remoteId, client, rc, io, targetId, local);
}

async function _register(remoteId, client, rc, io, deviceId, localInfo) {
    const result = await rc.auth.devices.register({
        deviceId,
        name: localInfo.hostname,
        hostname: localInfo.hostname,
        platform: localInfo.platform,
        arch: localInfo.arch,
        type: 'cli',
    });

    const devInfo = {
        deviceId: result.deviceId || deviceId,
        token: result.token,
        name: result.name || localInfo.hostname,
        platform: result.platform || localInfo.platform,
    };

    client.updateRemote(remoteId, { device: devInfo });
    io.success(`Device '${devInfo.name}' registered (${devInfo.deviceId})`);
    return devInfo;
}

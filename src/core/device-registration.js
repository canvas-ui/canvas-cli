'use strict';

import { select } from './prompt.js';
import device from '../modules/dot/lib/device.js';

/**
 * Ensure this machine is registered as a device on the given remote.
 * - If this host already holds the token cached in the remote config: no-op.
 * - If local deviceId matches one on the server: re-register to refresh token.
 * - If machine is new to this remote: prompt to pick existing device or register
 *   new, then adopt the resulting id as this host's identity.
 *
 * @param {string} remoteId
 * @param {import('./transport/rest.js').CanvasClient} client
 * @param {object} io
 * @param {{ force?: boolean }} opts
 */
export async function ensureDeviceRegistered(remoteId, client, io, { force = false } = {}) {
    const remote = client.getRemote(remoteId);
    const local = device.info();

    // The token is cached in remotes.json, which lives under CANVAS_HOME and may
    // therefore have arrived on portable media from another machine. Identity
    // does not travel, so a token minted for a different device is not this
    // device's to reuse — without this check the new host writes
    // file://<previous-host>/… for everything it indexes.
    if (!force && remote?.device?.token && remote.device.deviceId === local.deviceId) {
        return remote.device;
    }

    const rc = client.client(remoteId);

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

    return _register(remoteId, client, rc, io, chosen === '__new__' ? local.deviceId : chosen, local);
}

async function _register(remoteId, client, rc, io, deviceId, localInfo) {
    const result = await rc.auth.devices.register({
        deviceId,
        name: localInfo.hostname,
        hostname: localInfo.hostname,
        platform: localInfo.platform,
        osDistro: localInfo.osDistro,
        osVersion: localInfo.osVersion,
        arch: localInfo.arch,
        type: 'cli',
    });

    const devInfo = {
        deviceId: result.deviceId || deviceId,
        token: result.token,
        name: result.name || localInfo.hostname,
        platform: result.platform || localInfo.platform,
    };

    // Adopt whatever id the exchange settled on — the one the user picked out of
    // the registry, or the server's override. The host file is the only piece of
    // this that outlives a travelling remotes.json, so it has to agree, or the
    // staleness check above re-prompts on every command.
    if (devInfo.deviceId !== device.id) { device.bind(devInfo.deviceId); }

    client.updateRemote(remoteId, { device: devInfo });
    io.success(`Device '${devInfo.name}' registered (${devInfo.deviceId})`);
    return devInfo;
}

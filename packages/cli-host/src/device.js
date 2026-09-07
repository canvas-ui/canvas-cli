'use strict';

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

/*
 * This machine's identity, as the authority in every file://<deviceId>/<path>
 * location this client writes.
 *
 * Anchored to the machine's OWN home, deliberately not to CANVAS_HOME. That root
 * is routinely pointed at portable media (CANVAS_USER_HOME=/media/usb/canvas) so
 * one config can follow a user between machines — and if identity travelled with
 * it, the next host would silently adopt the previous host's id and attribute
 * every file it indexes to the wrong machine. Config travels, identity stays.
 *
 * A uuid, not a machine-id: it is the vocabulary the server already mints
 * (canvas-server core/device/ServerDevice.js), so one physical box stops
 * appearing twice in the registry under two different spellings. A machine-id
 * does not survive an OS reinstall anyway; that case is recovered by binding to
 * the existing device in the registration prompt, which is a decision only a
 * human can make.
 */

const HOST_HOME = process.platform === 'win32'
    ? join(os.homedir(), 'Canvas')
    : join(os.homedir(), '.canvas');

const FILE = process.env.CANVAS_DEVICE_FILE || join(HOST_HOME, 'device.json');

let cached = null;

/*
 * Distro and version, for the device/os/linux/ubuntu/24.04 facet chain — the
 * axis a fleet actually differs along. Linux only; /etc/os-release is the one
 * cross-distro contract for it.
 *
 * NB: canvas-server/src/core/device/ServerDevice.js carries the same probe.
 * Separate packages with no shared dependency, and the file format is frozen by
 * spec — cheaper duplicated than coupled.
 */
function osRelease() {
    if (os.platform() !== 'linux') { return {}; }
    try {
        const fields = Object.fromEntries(
            readFileSync('/etc/os-release', 'utf8')
                .split('\n')
                .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
                .filter(Boolean)
                .map(([, key, value]) => [key, value.replace(/^"|"$/g, '').trim()]),
        );
        return { osDistro: fields.ID || undefined, osVersion: fields.VERSION_ID || undefined };
    } catch {
        return {};
    }
}

// Re-read on every load: hostname and user are what a human reads in the
// registration prompt to decide "is this the box I called work-laptop", so they
// must be live rather than whatever was true when the id was minted. The OS
// fields are live for a stronger reason — an in-place distro upgrade has to
// reach the server, or the fleet view keeps answering 22.04.
function liveInfo() {
    return {
        hostname: os.hostname(),
        platform: os.platform(),
        ...osRelease(),
        // os.machine() (x86_64), not os.arch() (x64): the vocabulary flatpak,
        // snap and appimage publish against.
        arch: os.machine ? os.machine() : os.arch(),
        user: os.userInfo().username,
    };
}

function persist(deviceId, createdAt = new Date().toISOString()) {
    cached = { deviceId, createdAt, ...liveInfo() };
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(cached, null, 2), { mode: 0o600 });
    return cached;
}

function load() {
    if (cached) { return cached; }

    let saved = null;
    try { saved = JSON.parse(readFileSync(FILE, 'utf8')); } catch { /* absent or unreadable */ }

    const deviceId = process.env.CANVAS_DEVICE_ID?.trim() || saved?.deviceId;
    if (!deviceId) { return persist(randomUUID()); }

    cached = { ...saved, deviceId, ...liveInfo() };
    return cached;
}

export const device = {
    get id() { return load().deviceId; },
    info() { return { ...load() }; },

    // Adopt an identity chosen from the server's registry — a reinstalled
    // machine picking its old record. Has to write through to the host file or
    // the registration prompt returns on every single command.
    bind(deviceId) { return persist(deviceId, load().createdAt); },

    path: FILE,
};

export default device;

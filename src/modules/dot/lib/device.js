'use strict';

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import os from 'node:os';
import pkg from 'node-machine-id';
const { machineIdSync } = pkg;
import { DIR_VAR } from '../../../core/paths.js';
import { join } from 'node:path';

const FILE = join(DIR_VAR, 'device.json');

let cached = null;

function load() {
    if (cached) return cached;
    if (existsSync(FILE)) {
        try { cached = JSON.parse(readFileSync(FILE, 'utf8')); return cached; }
        catch { /* fall through */ }
    }
    cached = mint();
    save(cached);
    return cached;
}

function mint() {
    return {
        deviceId: machineIdSync(true).slice(0, 32),
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.machine ? os.machine() : os.arch(),
        user: os.userInfo().username,
        createdAt: new Date().toISOString(),
    };
}

function save(data) {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export const device = {
    get id() { return load().deviceId; },
    info() { return { ...load() }; },
    path: FILE,
};

export default device;

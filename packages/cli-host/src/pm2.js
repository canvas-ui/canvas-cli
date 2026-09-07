'use strict';

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DIR_VAR } from './paths.js';

const execAsync = promisify(exec);

/*
 * pm2 helpers shared by every runtime the CLI can supervise (canvas-server,
 * canvas-edge, canvas-fuse mounts). pm2 itself is an optional, user-level
 * install: the core CLI never needs it, the extension packages do.
 */

export const PM2_INSTALL = 'npm install -g pm2';

export async function hasPM2() {
    try { await execAsync('pm2 --version'); return true; }
    catch { return false; }
}

export async function getProcessInfo(name) {
    try {
        const { stdout } = await execAsync('pm2 jlist');
        const procs = JSON.parse(stdout);
        return procs.find((p) => p.name === name) || null;
    } catch { return null; }
}

/**
 * Environment worth handing to a pm2-managed process: our own settings, the
 * PATH/HOME family, nothing else. Dumping the whole environment into the
 * process file leaks secrets and (with quotes in values) used to break the
 * `pm2 start '<json>'` shell line into mangled process names.
 */
export function pm2Env(extra = {}) {
    const keep = /^(CANVAS_|PATH$|HOME$|USER$|LANG$|LC_|XDG_|TMPDIR$|NODE_|LOG_LEVEL$|DEBUG$)/;
    const env = {};
    for (const [k, v] of Object.entries(process.env)) if (keep.test(k) && v != null) env[k] = v;
    return { ...env, ...extra };
}

/** `pm2 start` from a process file under ~/.canvas/var/pm2 — no shell quoting of JSON. */
export async function pm2Start(cfg) {
    const dir = path.join(DIR_VAR, 'pm2');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${cfg.name}.config.json`);
    writeFileSync(file, JSON.stringify({ apps: [cfg] }, null, 2));
    await execAsync(`pm2 start "${file}"`);
    return file;
}

export async function pm2Stop(name) {
    await execAsync(`pm2 stop ${name}`).catch(() => {});
    await execAsync(`pm2 delete ${name}`).catch(() => {});
}

export async function pm2Save() {
    await execAsync('pm2 save').catch(() => {});
}

export function formatUptime(ts) {
    if (!ts) return 'N/A';
    const u = Date.now() - ts;
    const s = Math.floor(u / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

export function formatMemory(b) {
    if (!b) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${Math.round((b / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
}

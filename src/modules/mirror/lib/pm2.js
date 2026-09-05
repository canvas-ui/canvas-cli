'use strict';

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { hasPM2, getProcessInfo } from '../../server/lib/pm2.js';
import { fuseBinary, mountArgs } from './fuse.js';
import { CanvasError } from '../../../core/errors.js';

const execAsync = promisify(exec);

/*
 * pm2 supervision for mirror mounts: one process per mirror, attached (no
 * `-d`) so pm2 owns the lifecycle, restarts it after a crash and brings it
 * back at login once `pm2 startup` + `pm2 save` are in place. A FUSE mount is
 * empty while its daemon is down, so "runs at login" is the whole point.
 */

export const processName = (mirror) => `canvas-fuse-${mirror.workspaceName}`.replace(/[^a-zA-Z0-9._-]+/g, '-');

export async function requirePM2() {
    if (!(await hasPM2())) throw new CanvasError('PM2 not installed. `npm install -g pm2`');
}

export async function startProcess(mirror) {
    await requirePM2();
    const name = processName(mirror);
    const existing = await getProcessInfo(name);
    if (existing && existing.pm2_env?.status === 'online') return { name, started: false };
    if (existing) await execAsync(`pm2 delete ${name}`).catch(() => {});
    const cfg = {
        name,
        script: fuseBinary(),
        args: mountArgs(mirror),
        interpreter: 'none',
        env: { ...process.env },
        time: true,
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',
        restart_delay: 5000,
    };
    await execAsync(`pm2 start '${JSON.stringify(cfg).replace(/'/g, '\\\'')}'`);
    return { name, started: true };
}

export async function stopProcess(mirror) {
    await requirePM2();
    const name = processName(mirror);
    const existing = await getProcessInfo(name);
    if (!existing) return { name, stopped: false };
    await execAsync(`pm2 stop ${name}`).catch(() => {});
    await execAsync(`pm2 delete ${name}`).catch(() => {});
    return { name, stopped: true };
}

export async function save() {
    await execAsync('pm2 save').catch(() => {});
}

export const STARTUP_HINT = 'To start mirrors at login run `pm2 startup` once (follow its instructions), then `pm2 save`.';

'use strict';

import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hasPM2, getProcessInfo, pm2Env, pm2Start } from '../../server/lib/pm2.js';
import { fuseBinary, mountArgs } from './fuse.js';
import { CanvasError } from '../../../core/errors.js';
import { select, spinner } from '../../../core/prompt.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/*
 * pm2 supervision for mirror mounts: one process per mirror, attached (no
 * `-d`) so pm2 owns the lifecycle, restarts it after a crash and brings it
 * back at login once `pm2 startup` + `pm2 save` are in place. A FUSE mount is
 * empty while its daemon is down, so "runs at login" is the whole point.
 */

export const processName = (mirror) => `canvas-fuse-${mirror.workspaceName}`.replace(/[^a-zA-Z0-9._-]+/g, '-');
export const PM2_INSTALL = 'npm install -g pm2';

export async function requirePM2() {
    if (!(await hasPM2())) throw new CanvasError(`PM2 not installed. \`${PM2_INSTALL}\``);
}

/**
 * Preflight for anything that wants pm2: returns true when it is available.
 * Interactively it offers to install it (npm -g) and, failing that, lets the
 * caller fall back to unsupervised starts instead of dying after the config
 * has already been written.
 */
export async function ensurePM2({ interactive = false, io } = {}) {
    if (await hasPM2()) return true;
    if (!interactive) return false;
    const choice = await select('pm2 is not installed. It keeps mirrors running and restarts them at login.', [
        { label: 'Install it now', value: 'install', hint: PM2_INSTALL },
        { label: 'Skip — start mirrors unsupervised', value: 'skip', hint: 'you can run `canvas mirror service install` later' },
    ]);
    if (choice !== 'install') return false;
    const s = spinner();
    s.start('Installing pm2…');
    try {
        await execFileAsync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '-g', 'pm2'], { timeout: 300000, maxBuffer: 16 * 1024 * 1024, shell: process.platform === 'win32' });
    } catch (err) {
        const tail = String(err.stderr || err.message || '').trim().split('\n').slice(-3).join('\n');
        s.stop('pm2 install failed');
        io?.warn?.(`${tail}\nInstall it by hand (\`${PM2_INSTALL}\`, maybe with sudo) and run \`canvas mirror service install\`.`);
        return false;
    }
    if (await hasPM2()) { s.stop('pm2 installed'); return true; }
    s.stop('pm2 installed, but not on PATH yet');
    io?.warn?.('Open a new shell (or fix npm\'s global bin PATH) and run `canvas mirror service install`.');
    return false;
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
        env: pm2Env(),
        time: true,
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',
        restart_delay: 5000,
    };
    await pm2Start(cfg);
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

/** Stop + start under pm2 (picks up a changed mirrors.json entry, or revives a dead mount). */
export async function restartProcess(mirror) {
    await stopProcess(mirror);
    return startProcess(mirror);
}

export async function save() {
    await execAsync('pm2 save').catch(() => {});
}

export const STARTUP_HINT = 'To start mirrors at login run `pm2 startup` once (follow its instructions), then `pm2 save`.';

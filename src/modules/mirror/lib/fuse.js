'use strict';

import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CanvasError } from '@augmentd-labs/canvas-cli-host/errors';
import { FUSE_INSTALL_PATH } from './fuse-release.js';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));

/*
 * Thin wrapper around the canvas-fuse binary. The mirror engine lives there
 * (Home as a real folder, index + base ledger, write-back queue, reconcile
 * with a folder scan on every mount); this
 * module only turns a mirrors.json entry into the right command line and reads
 * the daemon's status back. Credentials never go on the command line: the
 * mount resolves them from ~/.canvas/config/remotes.json via `--remote <id>`,
 * exactly like the CLI does.
 */

export function fuseBinary() {
    const candidates = [
        process.env.CANVAS_FUSE_BIN,
        // The copy this CLI installs and updates (lib/fuse-release.js).
        FUSE_INSTALL_PATH,
        path.join(os.homedir(), '.cargo', 'bin', 'canvas-fuse'),
        // Dev checkout: <container>/canvas-fuse next to canvas-cli.
        path.resolve(HERE, '../../../../../canvas-fuse/target/release/canvas-fuse'),
        path.resolve(HERE, '../../../../../canvas-fuse/target/debug/canvas-fuse'),
    ].filter(Boolean);
    for (const c of candidates) if (existsSync(c)) return c;
    return 'canvas-fuse'; // PATH lookup at spawn time
}

export async function fuseAvailable() {
    try { await execFileAsync(fuseBinary(), ['--version']); return true; }
    catch { return false; }
}

/**
 * Command-line for one mirror. `detach` adds `-d` (daemonize); pm2 runs the
 * process attached so it can supervise it.
 */
export function mountArgs(mirror, { detach = false } = {}) {
    // -w names the mount dir (<root>/<folderName>); the hub resolves it case-insensitively.
    const args = ['mount', '-w', mirror.folderName || mirror.workspaceName, mirror.root, '--remote', mirror.remote, '--mirror'];
    // canvas-fuse >= 0.11 keeps every file local and ignores pins (accepted
    // for older binaries).
    for (const pin of mirror.pins || []) args.push('--pin', pin);
    for (const glob of mirror.ignore || []) args.push('--ignore', glob);
    if (mirror.conflicts) args.push('--conflicts', mirror.conflicts);
    if (mirror.deletes) args.push('--deletes', mirror.deletes);
    if (mirror.cacheBudgetMb) args.push('--cache-budget-mb', String(mirror.cacheBudgetMb));
    if (detach) args.push('-d');
    return args;
}

async function run(args, { timeout = 60000 } = {}) {
    try {
        const { stdout, stderr } = await execFileAsync(fuseBinary(), args, { timeout, maxBuffer: 16 * 1024 * 1024 });
        return { ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') };
    } catch (err) {
        if (err.code === 'ENOENT') throw new CanvasError('canvas-fuse binary not found. `canvas workspace <name> mount` installs it; or set CANVAS_FUSE_BIN.');
        return { ok: false, stdout: String(err.stdout || ''), stderr: String(err.stderr || err.message || '') };
    }
}

/**
 * Start a detached mount. canvas-fuse (≥ 0.18.1) answers once the mount is up
 * or has failed. A large folder is scanned first, which can outlast the wait:
 * `starting` then says the daemon is still preparing, not that it failed.
 */
export async function mount(mirror) {
    try {
        const { stdout, stderr } = await execFileAsync(fuseBinary(), mountArgs(mirror, { detach: true }), { timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
        return { ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') };
    } catch (err) {
        if (err.code === 'ENOENT') throw new CanvasError('canvas-fuse binary not found. `canvas workspace <name> mount` installs it; or set CANVAS_FUSE_BIN.');
        if (err.killed) return { ok: true, starting: true, stdout: '', stderr: '' };
        return { ok: false, stdout: String(err.stdout || ''), stderr: String(err.stderr || err.message || '') };
    }
}

/** The last `Error: …` line canvas-fuse printed, without its progress output. */
export function mountError(res) {
    const lines = `${res.stderr}\n${res.stdout}`.split('\n').map((l) => l.trim()).filter(Boolean);
    const error = lines.findLast((l) => l.startsWith('Error:'));
    return (error ? error.replace(/^Error:\s*/, '') : lines.at(-1)) || 'mount failed';
}

/** Whether a live canvas-fuse daemon already serves this mountpoint. */
export async function isMounted(mountpoint) {
    const st = await statusFor(mountpoint);
    return Boolean(st?.alive && st?.mounted);
}

export async function unmount(mountpoint) {
    return run(['unmount', mountpoint]);
}

/** `canvas-fuse status --json` → array of mounts (each may carry `mirror`). */
export async function statusAll() {
    const res = await run(['status', '--json']);
    if (!res.ok) return [];
    try {
        const parsed = JSON.parse(res.stdout || '[]');
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.mounts)) return parsed.mounts;
        return [];
    } catch { return []; }
}

export async function statusFor(mountpoint) {
    const all = await statusAll();
    const target = path.resolve(mountpoint);
    return all.find((m) => path.resolve(m.mountpoint || '') === target) || null;
}

export async function syncNow(mountpoint) { return run(['sync', 'now', mountpoint]); }
/** Hold or release all transfers of a running mount (canvas-fuse ≥ 0.18.0); the mount keeps the pause across restarts. */
export async function setPaused(mountpoint, paused) { return run(['sync', paused ? 'pause' : 'resume', mountpoint]); }
export async function pin(mountpoint, op, glob) { return run(['pin', op, mountpoint, ...(glob ? [glob] : [])]); }
export async function conflicts(mountpoint) {
    const res = await run(['conflicts', mountpoint, '--json']);
    if (!res.ok) return [];
    try { return JSON.parse(res.stdout || '[]'); } catch { return []; }
}
export async function deletes(mountpoint, op) { return run(['deletes', op, mountpoint]); }
export async function trash(mountpoint, op, key) { return run(['trash', op, mountpoint, ...(key ? [key] : [])]); }

/** Stream a foreground mount (used by `mirror start --foreground`). */
export function mountForeground(mirror) {
    return new Promise((resolve) => {
        const p = spawn(fuseBinary(), mountArgs(mirror), { stdio: 'inherit' });
        process.on('SIGINT', () => p.kill('SIGINT'));
        p.on('close', (code) => resolve(code ?? 0));
    });
}

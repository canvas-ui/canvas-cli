'use strict';

import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CanvasError } from '../../../core/errors.js';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));

/*
 * Thin wrapper around the canvas-fuse binary. The mirror engine lives there
 * (persistent Home tree, content cache, write-back queue, reconcile); this
 * module only turns a mirrors.json entry into the right command line and reads
 * the daemon's status back. Credentials never go on the command line: the
 * mount resolves them from ~/.canvas/config/remotes.json via `--remote <id>`,
 * exactly like the CLI does.
 */

export function fuseBinary() {
    const candidates = [
        process.env.CANVAS_FUSE_BIN,
        path.join(os.homedir(), '.cargo', 'bin', 'canvas-fuse'),
        // Dev checkout: <container>/canvas-fuse next to the monorepo.
        path.resolve(HERE, '../../../../../../../canvas-fuse/target/release/canvas-fuse'),
        path.resolve(HERE, '../../../../../../../canvas-fuse/target/debug/canvas-fuse'),
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
        if (err.code === 'ENOENT') throw new CanvasError('canvas-fuse binary not found. Install it (cargo install --path canvas-fuse) or set CANVAS_FUSE_BIN.');
        return { ok: false, stdout: String(err.stdout || ''), stderr: String(err.stderr || err.message || '') };
    }
}

export async function mount(mirror) {
    return run(mountArgs(mirror, { detach: true }), { timeout: 120000 });
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
export async function pin(mountpoint, op, glob) { return run(['pin', op, mountpoint, ...(glob ? [glob] : [])]); }
export async function conflicts(mountpoint) {
    const res = await run(['conflicts', mountpoint, '--json']);
    if (!res.ok) return [];
    try { return JSON.parse(res.stdout || '[]'); } catch { return []; }
}
export async function trash(mountpoint, op, key) { return run(['trash', op, mountpoint, ...(key ? [key] : [])]); }

/** Stream a foreground mount (used by `mirror start --foreground`). */
export function mountForeground(mirror) {
    return new Promise((resolve) => {
        const p = spawn(fuseBinary(), mountArgs(mirror), { stdio: 'inherit' });
        process.on('SIGINT', () => p.kill('SIGINT'));
        p.on('close', (code) => resolve(code ?? 0));
    });
}

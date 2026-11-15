'use strict';

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { CanvasError } from '@augmentd-labs/canvas-cli-host/errors';

const execFileAsync = promisify(execFile);

/*
 * The canvas-fuse binary this CLI manages: one copy next to `canvas` itself
 * (~/.local/bin, or CANVAS_INSTALL_DIR as for scripts/install.sh), taken from
 * the canvas-fuse GitHub releases and verified against the release's own
 * checksum. `workspace mount` offers to install it, `canvas update` keeps it
 * current. A copy from cargo, a checkout or CANVAS_FUSE_BIN is the user's and
 * is never touched.
 */

export const FUSE_REPO = 'canvas-ui/canvas-fuse';
export const FUSE_INSTALL_DIR = process.env.CANVAS_INSTALL_DIR || path.join(os.homedir(), '.local', 'bin');
export const FUSE_INSTALL_PATH = path.join(FUSE_INSTALL_DIR, 'canvas-fuse');

const REQUEST_TIMEOUT_MS = 60_000;

/** Release target for this machine; null where canvas-fuse is not built (it is Linux-only). */
export function fuseTarget(platform = process.platform, arch = process.arch) {
    if (platform !== 'linux') return null;
    // x64: the static musl build runs on any distro.
    if (arch === 'x64') return 'x86_64-unknown-linux-musl';
    if (arch === 'arm64') return 'aarch64-unknown-linux-gnu';
    return null;
}

/** `canvas-fuse 0.17.1` → `0.17.1`. */
export function parseFuseVersion(text) {
    return String(text || '').match(/(\d+\.\d+\.\d+)/)?.[1] || null;
}

/** `<sha256>  <file>` (sha256sum output) → the digest. */
export function parseChecksum(text) {
    return String(text || '').trim().match(/^([0-9a-f]{64})\b/i)?.[1]?.toLowerCase() || null;
}

async function request(url, headers = {}) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(url, { headers: { 'user-agent': 'canvas-cli', ...headers }, signal: abort.signal });
        if (!res.ok) throw new CanvasError(`${url}: HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    } catch (err) {
        if (err instanceof CanvasError) throw err;
        throw new CanvasError(`${url}: ${abort.signal.aborted ? 'timed out' : err?.cause?.message || err.message}`);
    } finally {
        clearTimeout(timer);
    }
}

async function versionAt(bin) {
    try { return parseFuseVersion((await execFileAsync(bin, ['--version'])).stdout); }
    catch { return null; }
}

/** The managed copy, or null when there is none. */
export async function installedFuse() {
    if (!existsSync(FUSE_INSTALL_PATH)) return null;
    const version = await versionAt(FUSE_INSTALL_PATH);
    return version ? { version, dir: FUSE_INSTALL_PATH } : null;
}

export async function latestFuseVersion() {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const body = await request(`https://api.github.com/repos/${FUSE_REPO}/releases/latest`, {
        accept: 'application/vnd.github+json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
    });
    const version = parseFuseVersion(JSON.parse(body.toString('utf8'))?.tag_name);
    if (!version) throw new CanvasError(`${FUSE_REPO}: no release found`);
    return version;
}

/**
 * Download release `version` (default: latest), verify it, run it once and
 * move it into place. The rename is atomic, and a running mount keeps the
 * binary it started with.
 */
export async function installFuse({ version = null, onStep = () => {} } = {}) {
    const target = fuseTarget();
    if (!target) throw new CanvasError(`canvas-fuse has no build for ${process.platform}/${process.arch} (Linux x64 and arm64 only)`);
    const wanted = version || await latestFuseVersion();
    const asset = `canvas-fuse-${target}.tar.gz`;
    const base = `https://github.com/${FUSE_REPO}/releases/download/v${wanted}`;
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'canvas-fuse-'));
    try {
        onStep(`downloading canvas-fuse ${wanted}…`);
        const archive = await request(`${base}/${asset}`);
        const expected = parseChecksum((await request(`${base}/${asset}.sha256`)).toString('utf8'));
        const actual = createHash('sha256').update(archive).digest('hex');
        if (!expected || expected !== actual) throw new CanvasError(`canvas-fuse ${wanted}: checksum mismatch for ${asset} (expected ${expected || 'none'}, got ${actual})`);
        writeFileSync(path.join(tmp, asset), archive);
        await execFileAsync('tar', ['-xzf', path.join(tmp, asset), '-C', tmp]);
        const unpacked = path.join(tmp, `canvas-fuse-${target}`, 'canvas-fuse');
        if (!existsSync(unpacked)) throw new CanvasError(`canvas-fuse ${wanted}: ${asset} does not contain the binary`);
        chmodSync(unpacked, 0o755);
        const runs = await versionAt(unpacked);
        if (runs !== wanted) throw new CanvasError(`canvas-fuse ${wanted}: the downloaded binary ${runs ? `reports ${runs}` : 'does not run'}`);
        onStep(`installing to ${FUSE_INSTALL_PATH}…`);
        mkdirSync(FUSE_INSTALL_DIR, { recursive: true });
        // Staged next to the destination: the download dir may be another filesystem.
        const staged = `${FUSE_INSTALL_PATH}.new`;
        copyFileSync(unpacked, staged);
        chmodSync(staged, 0o755);
        renameSync(staged, FUSE_INSTALL_PATH);
        return { version: wanted, path: FUSE_INSTALL_PATH };
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

/** fusermount3 does the actual mount; canvas-fuse cannot work without it. */
export async function hasFusermount() {
    try { await execFileAsync('fusermount3', ['-V']); return true; }
    catch (err) { return err?.code !== 'ENOENT'; }
}

/** What `canvas update` sees: the managed canvas-fuse binary. */
export const fuseService = {
    id: 'fuse',
    label: 'canvas-fuse',
    description: `workspace mount client (${FUSE_REPO} releases → ${FUSE_INSTALL_PATH})`,
    installed: installedFuse,
    async latest() {
        return { version: await latestFuseVersion() };
    },
    async update({ onStep } = {}) {
        const before = await installedFuse();
        const after = await installFuse({ onStep });
        return { before: before?.version || null, after: after.version };
    },
    async restart() {
        // Remounting interrupts transfers in flight; that is the user's call.
        return { skipped: 'running mounts keep the old binary until `canvas mirror restart all`' };
    },
};

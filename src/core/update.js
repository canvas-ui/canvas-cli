'use strict';

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, createWriteStream, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { CanvasError } from './errors.js';
import pkg from '../../package.json' with { type: 'json' };

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));

/*
 * `canvas update` plumbing. Three things can be out of date on a device: the
 * CLI itself, the lazily installed CLI packages (~/.canvas/packages/<key>) and
 * the local services those packages run (canvas-edge, a local canvas-server).
 * The CLI is updated the way it was installed — a compiled binary swaps
 * itself for the matching asset of the newest `cli-v*` GitHub Release
 * (same download + SHA256SUMS check as scripts/install.sh), an npm install
 * asks npm, a source checkout is left to git. Packages and dist-branch
 * artifacts are compared by the `canvasRev` pack-dist stamps into them.
 */

export const REPO = 'canvas-ui/canvas';
export const NPM_PACKAGE = pkg.name;
export const CLI_VERSION = pkg.version || '0.0.0';

const GITHUB_API = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 20_000;

/** Release asset for this platform, mirroring scripts/install.sh / install.ps1. */
export function assetFor(platform = process.platform, arch = process.arch) {
    if (platform === 'linux') {
        if (arch === 'x64') return 'canvas-linux';
        if (arch === 'arm64') return 'canvas-linux-arm';
    } else if (platform === 'darwin') {
        if (arch === 'x64') return 'canvas-macos';
        if (arch === 'arm64') return 'canvas-macos-arm';
    } else if (platform === 'win32' && arch === 'x64') {
        return 'canvas-windows.exe';
    }
    return null;
}

/** [major, minor, patch, prerelease?] of `2.7.1`, `v2.7.1`, `cli-v2.7.1`; null when unparsable. */
export function parseVersion(input) {
    const m = String(input || '').trim().match(/^(?:cli-)?v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
    if (!m) return null;
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] || null, text: `${m[1]}.${m[2]}.${m[3]}${m[4] ? `-${m[4]}` : ''}` };
}

/** -1 | 0 | 1 like a comparator; a prerelease sorts below its release. */
export function compareVersions(a, b) {
    const va = parseVersion(a);
    const vb = parseVersion(b);
    if (!va || !vb) return 0;
    for (const k of ['major', 'minor', 'patch']) {
        if (va[k] !== vb[k]) return va[k] < vb[k] ? -1 : 1;
    }
    if (va.pre === vb.pre) return 0;
    if (!va.pre) return 1;
    if (!vb.pre) return -1;
    return va.pre < vb.pre ? -1 : 1;
}

export const isNewer = (candidate, current) => compareVersions(candidate, current) > 0;

/**
 * How this CLI got here — decides how it updates itself.
 *   binary: bun-compiled release binary (scripts/install.sh, install.ps1)
 *   npm:    `npm install -g @augmentd-labs/canvas-cli` (bin/canvas.js under node)
 *   source: a monorepo checkout (apps/cli/src next to packages/cli-host)
 */
export function installMode({ execPath = process.execPath, versions = process.versions, here = HERE } = {}) {
    // path.basename on POSIX does not split backslashes; a Windows execPath must still resolve.
    const base = path.basename(execPath).split('\\').pop().toLowerCase();
    if (versions?.bun && /^canvas(-[a-z0-9-]+)?(\.exe)?$/.test(base)) return { mode: 'binary', path: execPath };
    const sourceMarker = path.resolve(here, '../../../../packages/cli-host/package.json');
    const inGit = path.resolve(here, '../../../../.git');
    if (existsSync(sourceMarker) && existsSync(inGit)) return { mode: 'source', path: path.resolve(here, '../..') };
    return { mode: 'npm', path: path.resolve(here, '../..') };
}

function githubHeaders() {
    const headers = { accept: 'application/vnd.github+json', 'user-agent': `canvas-cli/${CLI_VERSION}` };
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
}

async function fetchWithTimeout(url, init = {}) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: abort.signal });
    } catch (err) {
        throw new CanvasError(`${url}: ${abort.signal.aborted ? 'timed out' : err?.cause?.message || err.message}`);
    } finally {
        clearTimeout(timer);
    }
}

async function fetchJson(url, init = {}) {
    const res = await fetchWithTimeout(url, init);
    if (!res.ok) throw new CanvasError(`${url}: HTTP ${res.status}${res.status === 403 ? ' (GitHub rate limit? set GITHUB_TOKEN)' : ''}`);
    return res.json();
}

/** Newest `cli-v*` GitHub Release: { version, tag, assets: { name → url } }. */
export async function latestCliRelease() {
    const releases = await fetchJson(`${GITHUB_API}/repos/${REPO}/releases?per_page=50`, { headers: githubHeaders() });
    const cli = (Array.isArray(releases) ? releases : [])
        .filter((r) => !r.draft && !r.prerelease && /^cli-v\d/.test(r.tag_name || ''))
        .map((r) => ({ tag: r.tag_name, version: parseVersion(r.tag_name)?.text, assets: Object.fromEntries((r.assets || []).map((a) => [a.name, a.browser_download_url])) }))
        .filter((r) => r.version)
        .sort((a, b) => compareVersions(b.version, a.version));
    return cli[0] || null;
}

/** A specific `cli-v<version>` release, for `--to`. */
export async function cliRelease(version) {
    const v = parseVersion(version)?.text;
    if (!v) throw new CanvasError(`'${version}' is not a version (2.7.1 or cli-v2.7.1)`);
    const r = await fetchJson(`${GITHUB_API}/repos/${REPO}/releases/tags/cli-v${v}`, { headers: githubHeaders() });
    return { tag: r.tag_name, version: v, assets: Object.fromEntries((r.assets || []).map((a) => [a.name, a.browser_download_url])) };
}

/** Newest published version on npm, or null when the registry is unreachable. */
export async function latestNpmVersion(name = NPM_PACKAGE) {
    const json = await fetchJson(`https://registry.npmjs.org/${name}/latest`);
    return json?.version || null;
}

/** `canvasRev` + version of the package.json on a dist branch (what pack-dist published). */
export async function distBranchManifest(branch) {
    const res = await fetchWithTimeout(`https://raw.githubusercontent.com/${REPO}/${branch}/package.json`, { headers: { 'user-agent': `canvas-cli/${CLI_VERSION}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new CanvasError(`${branch}: HTTP ${res.status}`);
    const json = await res.json();
    return { version: json.version || null, rev: json.canvasRev || null };
}

/** HEAD commit (short) of a branch in a GitHub repo. */
export async function branchHead(repo, branch = 'main') {
    const json = await fetchJson(`${GITHUB_API}/repos/${repo}/branches/${encodeURIComponent(branch)}`, { headers: githubHeaders() });
    const sha = json?.commit?.sha || null;
    return sha ? { sha, rev: sha.slice(0, 7) } : null;
}

async function download(url, dest) {
    const res = await fetchWithTimeout(url, { headers: { 'user-agent': `canvas-cli/${CLI_VERSION}` } });
    if (!res.ok || !res.body) throw new CanvasError(`download failed: ${url} (HTTP ${res.status})`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
    const size = statSync(dest).size;
    if (size === 0) throw new CanvasError(`download is empty: ${url}`);
    return size;
}

function sha256File(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function expectedChecksum(sumsText, asset) {
    for (const line of String(sumsText).split('\n')) {
        const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
        if (m && path.basename(m[2].trim()) === asset) return m[1].toLowerCase();
    }
    return null;
}

/**
 * Replace the running compiled binary with the asset of `release`. The new
 * file lands next to the old one (same filesystem → atomic rename), is
 * checksummed against SHA256SUMS and run once (`--version`) before it takes
 * the name. A running executable keeps its old inode on POSIX; Windows
 * cannot overwrite a running .exe, so the old one is moved aside first.
 */
export async function updateBinary(release, { execPath = process.execPath, onStep = () => {} } = {}) {
    const asset = assetFor();
    if (!asset) throw new CanvasError(`no release binary for ${process.platform}/${process.arch}`);
    const url = release.assets?.[asset];
    if (!url) throw new CanvasError(`release ${release.tag} has no asset '${asset}'`);
    const dir = path.dirname(execPath);
    let tmpDir;
    try {
        tmpDir = mkdtempSync(path.join(dir, '.canvas-update-'));
    } catch (err) {
        throw new CanvasError(`cannot write to ${dir} (${err.code || err.message}) — re-run the installer with the right permissions, or set CANVAS_INSTALL_DIR`);
    }
    const tmp = path.join(tmpDir, asset);
    try {
        onStep(`Downloading ${asset} ${release.version}…`);
        await download(url, tmp);
        const sumsUrl = release.assets?.SHA256SUMS;
        if (sumsUrl) {
            const sums = await (await fetchWithTimeout(sumsUrl, { headers: { 'user-agent': `canvas-cli/${CLI_VERSION}` } })).text();
            const expected = expectedChecksum(sums, asset);
            if (expected) {
                const actual = sha256File(tmp);
                if (actual !== expected) throw new CanvasError(`checksum mismatch for ${asset} (expected ${expected}, got ${actual})`);
            }
        }
        if (process.platform !== 'win32') chmodSync(tmp, 0o755);
        onStep('Verifying the new binary…');
        const { stdout } = await execFileAsync(tmp, ['--version'], { timeout: 30_000 });
        if (!String(stdout).includes(release.version)) throw new CanvasError(`downloaded binary reports "${String(stdout).trim()}", expected ${release.version}`);
        onStep(`Installing to ${execPath}…`);
        if (process.platform === 'win32') {
            const old = `${execPath}.old`;
            try { unlinkSync(old); } catch { /* none */ }
            renameSync(execPath, old);
            try { renameSync(tmp, execPath); } catch (err) { renameSync(old, execPath); throw err; }
        } else {
            renameSync(tmp, execPath);
        }
        return { path: execPath, version: release.version };
    } finally {
        rmSync(tmpDir, { recursive: true, force: true });
    }
}

/** `npm install -g <name>@<version>` (or latest). */
export async function updateNpm(version = 'latest', { onStep = () => {} } = {}) {
    onStep(`npm install -g ${NPM_PACKAGE}@${version}…`);
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    try {
        await execFileAsync(npm, ['install', '-g', `${NPM_PACKAGE}@${version}`, '--no-audit', '--no-fund'], { timeout: 600_000, maxBuffer: 16 * 1024 * 1024, shell: process.platform === 'win32' });
    } catch (err) {
        const tail = String(err.stderr || err.message || '').trim().split('\n').slice(-4).join('\n');
        throw new CanvasError(`npm install -g failed:\n${tail}${/EACCES|EPERM/.test(tail) ? '\n(global npm prefix is not writable — try `sudo`, or an npm prefix in your home)' : ''}`);
    }
}

/** Leftovers of a Windows self-update (the old exe cannot be deleted while it runs). */
export function cleanupOldBinary(execPath = process.execPath) {
    if (process.platform !== 'win32') return;
    try { unlinkSync(`${execPath}.old`); } catch { /* still running last time, or none */ }
}

/** Runs an installed CLI in a child to learn its version (`canvas --version` → `canvas-cli v2.7.1`). */
export function versionOf(bin, args = ['--version']) {
    return new Promise((resolve) => {
        let out = '';
        const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' });
        child.stdout.on('data', (d) => { out += d; });
        child.on('error', () => resolve(null));
        child.on('close', () => resolve(parseVersion(out.replace(/^.*?v/, ''))?.text || null));
    });
}

export const homedir = () => os.homedir();

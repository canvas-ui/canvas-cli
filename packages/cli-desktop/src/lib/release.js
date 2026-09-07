'use strict';

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { CANVAS_HOME } from '@augmentd-labs/canvas-cli-host/paths';
import { CanvasError } from '@augmentd-labs/canvas-cli-host/errors';

/*
 * Desktop releases are `desktop-v*` tags on the monorepo (tauri-action
 * attaches one installer per OS). We pick the newest, choose the asset for
 * this platform, download it into ~/.canvas/apps/desktop and remember which.
 */
export const REPO = process.env.CANVAS_DESKTOP_REPO || 'canvas-ui/canvas';
export const APP_DIR = path.join(CANVAS_HOME, 'apps', 'desktop');
const STATE = path.join(APP_DIR, 'installed.json');

const PATTERNS = {
    linux: [/\.AppImage$/i, /\.deb$/i],
    darwin: [/\.dmg$/i, /\.app\.tar\.gz$/i],
    win32: [/\.msi$/i, /-setup\.exe$/i, /\.exe$/i],
};

export async function latestRelease() {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'canvas-cli' } });
    if (!res.ok) throw new CanvasError(`GitHub API ${res.status} listing releases of ${REPO}`);
    const releases = (await res.json()).filter((r) => /^desktop-v/.test(r.tag_name) && !r.draft && !r.prerelease);
    if (releases.length === 0) throw new CanvasError(`No desktop release found on ${REPO}`);
    return releases.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
}

export function pickAsset(release, platform = process.platform, arch = process.arch) {
    const pats = PATTERNS[platform] || [];
    const archHint = arch === 'arm64' ? /(arm64|aarch64)/i : /(x64|amd64|x86_64)/i;
    const assets = release.assets || [];
    for (const pat of pats) {
        const hits = assets.filter((a) => pat.test(a.name));
        const byArch = hits.find((a) => archHint.test(a.name)) || hits.find((a) => !/(arm64|aarch64|x64|amd64|x86_64)/i.test(a.name)) || hits[0];
        if (byArch) return byArch;
    }
    return null;
}

export async function download(asset, dest) {
    mkdirSync(path.dirname(dest), { recursive: true });
    const res = await fetch(asset.browser_download_url, { headers: { 'user-agent': 'canvas-cli' } });
    if (!res.ok || !res.body) throw new CanvasError(`Download failed: ${res.status} ${asset.browser_download_url}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
    if (/\.(AppImage|app|exe)$/i.test(dest) || process.platform !== 'win32') { try { chmodSync(dest, 0o755); } catch { /* fine */ } }
    return dest;
}

export function installed() {
    try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return null; }
}

export function remember(info) {
    mkdirSync(APP_DIR, { recursive: true });
    writeFileSync(STATE, JSON.stringify(info, null, 2) + '\n');
}

export function installedPath() {
    const info = installed();
    return info?.path && existsSync(info.path) ? info.path : null;
}

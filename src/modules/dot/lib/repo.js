'use strict';

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { git } from './git.js';
import { localRepoDir, gitUrlWithAuth } from './paths.js';
import { CanvasError } from '../../../core/errors.js';

export async function ensureCloned(handle) {
    const dir = localRepoDir(handle);
    if (existsSync(dir)) return dir;
    mkdirSync(dirname(dir), { recursive: true });
    const url = gitUrlWithAuth(handle);
    await git(['clone', '--branch', 'main', url, dir]);
    // strip token from remote URL — store a clean origin
    await setOriginUrl(dir, stripCreds(url));
    return dir;
}

export async function pullWithAuth(handle) {
    const dir = localRepoDir(handle);
    if (!existsSync(dir)) throw new CanvasError(`No local clone. Run \`dot clone ${handle.full || handle.id}\``);
    await withAuthOrigin(handle, dir, async () => {
        await git(['pull', '--ff-only', 'origin', 'main'], { cwd: dir });
    });
    return dir;
}

export async function pushWithAuth(handle) {
    const dir = localRepoDir(handle);
    if (!existsSync(dir)) throw new CanvasError(`No local clone. Run \`dot clone ${handle.full || handle.id}\``);
    await withAuthOrigin(handle, dir, async () => {
        await git(['push', 'origin', 'main'], { cwd: dir });
    });
    return dir;
}

async function withAuthOrigin(handle, dir, fn) {
    const cleanUrl = stripCreds(gitUrlWithAuth(handle));
    const authUrl = gitUrlWithAuth(handle);
    await setOriginUrl(dir, authUrl);
    try { await fn(); }
    finally { await setOriginUrl(dir, cleanUrl); }
}

async function setOriginUrl(dir, url) {
    try { await git(['remote', 'set-url', 'origin', url], { cwd: dir }); }
    catch { await git(['remote', 'add', 'origin', url], { cwd: dir }); }
}

function stripCreds(url) {
    return url.replace(/\/\/[^@]+@/, '//');
}

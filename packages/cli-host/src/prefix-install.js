'use strict';

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { CanvasError } from './errors.js';

const execFileAsync = promisify(execFile);

/*
 * Install an npm-fetchable package into a CLI-owned prefix
 * (~/.canvas/packages/<key>, ~/.canvas/edge) as an ordinary project
 * dependency — never `npm -g`: global installs of git packages with bundled
 * deps came out half-empty on npm 11, plain installs never did. No sudo, no
 * PATH games; update = `npm update` in the prefix.
 *
 * --ignore-scripts: native deps ship prebuilt platform binaries as optional
 * deps; their install scripts only run node-gyp-build-optional-packages,
 * which fails when npm has not linked that bin yet.
 */

const npmBin = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

export function prefixManifest(prefix, name, spec, label) {
    mkdirSync(prefix, { recursive: true });
    writeFileSync(path.join(prefix, 'package.json'), JSON.stringify({
        name: `canvas-prefix-${path.basename(prefix)}`, private: true, description: label || `managed by the canvas CLI`,
        dependencies: { [name]: spec },
    }, null, 2) + '\n');
}

export async function installIntoPrefix({ prefix, name, spec, update = false, label }) {
    prefixManifest(prefix, name, spec, label);
    const args = [update ? 'update' : 'install', '--ignore-scripts', '--no-audit', '--no-fund'];
    try {
        await execFileAsync(npmBin(), args, { cwd: prefix, timeout: 900000, maxBuffer: 32 * 1024 * 1024, shell: process.platform === 'win32' });
    } catch (err) {
        const tail = String(err.stderr || err.message || '').trim().split('\n').filter((l) => !/TAR_ENTRY_ERROR|deprecated|EBADENGINE|allow-scripts/.test(l)).slice(-4).join('\n');
        throw new CanvasError(`npm ${args[0]} in ${prefix} failed:\n${tail}`);
    }
    const dir = path.join(prefix, 'node_modules', name);
    if (!existsSync(path.join(dir, 'package.json'))) throw new CanvasError(`${prefix} installed, but ${dir} is missing`);
    return dir;
}

/** { version, rev, dir } of what a prefix holds, or null. */
export function installedInPrefix(prefix, name) {
    try {
        const dir = path.join(prefix, 'node_modules', name);
        const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
        return { version: pkg.version, rev: pkg.canvasRev || null, dir };
    } catch { return null; }
}

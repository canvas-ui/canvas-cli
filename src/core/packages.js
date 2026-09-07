'use strict';

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CANVAS_HOME } from './paths.js';
import { installIntoPrefix, installedInPrefix } from '@augmentd-labs/canvas-cli-host/prefix-install';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/*
 * Lazily installed CLI packages. The core CLI stays small (auth, remotes,
 * workspaces, contexts…); anything that drags a runtime along — mirrors and
 * canvas-edge, a local canvas-server under pm2, the desktop app — is a
 * separate package fetched on first use into ~/.canvas/packages/<key> and
 * loaded from there. Until then a placeholder module answers with the offer.
 *
 * Each package is a monorepo workspace (packages/cli-<key>) published as the
 * self-contained `cli-<key>-dist` branch (scripts/pack-dist.mjs). From a
 * source checkout the workspace copy is used directly, so development needs
 * no install step. CANVAS_PACKAGE_SPEC_<KEY> overrides the fetch spec.
 */
export const CATALOG = Object.freeze({
    mirror: {
        name: '@augmentd-labs/canvas-cli-mirror',
        dist: 'cli-mirror-dist',
        mount: 'remote',
        description: 'Workspace mirrors on this device (canvas-edge / canvas-fuse), first-run wizard, pm2 supervision',
        size: '~1 MB, plus the canvas-edge runtime on the first daemon mirror',
        commands: ['remote mirror …', 'mirror …'],
    },
    server: {
        name: '@augmentd-labs/canvas-cli-server',
        dist: 'cli-server-dist',
        mount: null,
        description: 'Run a local canvas-server under pm2 (install, start, stop, logs)',
        size: '<1 MB, plus a canvas-server checkout on `server install`',
        commands: ['server …'],
    },
    desktop: {
        name: '@augmentd-labs/canvas-cli-desktop',
        dist: 'cli-desktop-dist',
        mount: null,
        description: 'Fetch and launch the Canvas desktop app release for this platform',
        size: '<1 MB, plus the app download (~100 MB)',
        commands: ['desktop …'],
    },
});

export const PACKAGES_DIR = path.join(CANVAS_HOME, 'packages');
export const keys = () => Object.keys(CATALOG);

export function spec(key) {
    const env = process.env[`CANVAS_PACKAGE_SPEC_${key.toUpperCase()}`];
    return env || `github:canvas-ui/canvas#${CATALOG[key].dist}`;
}

export const prefix = (key) => path.join(PACKAGES_DIR, key);

/** The workspace copy when running from a source checkout (never inside a compiled binary). */
export function devDir(key) {
    if (process.env.CANVAS_PACKAGES_NO_DEV) return null;
    const dir = path.resolve(HERE, '../../../../packages', `cli-${key}`);
    return existsSync(path.join(dir, 'package.json')) ? dir : null;
}

/** { dir, source: 'dev'|'installed', version?, rev? } or null. */
export function locate(key) {
    const dev = devDir(key);
    if (dev) return { dir: dev, source: 'dev' };
    const inst = installedInPrefix(prefix(key), CATALOG[key].name);
    return inst ? { ...inst, source: 'installed' } : null;
}

export async function load(key) {
    const where = locate(key);
    if (!where) return null;
    // Installed artifacts are one self-contained file (pack-dist); the workspace copy runs from src.
    const file = ['dist/index.js', 'src/index.js'].map((f) => path.join(where.dir, f)).find((f) => existsSync(f));
    if (!file) throw new Error(`${CATALOG[key].name}: no dist/index.js or src/index.js in ${where.dir}`);
    const mod = (await import(pathToFileURL(file).href)).default;
    if (!mod?.name) throw new Error(`${CATALOG[key].name} did not export a CLI module`);
    return { mod, where };
}

export async function install(key, { update = false } = {}) {
    if (!CATALOG[key]) throw new Error(`unknown package '${key}' (${keys().join(', ')})`);
    return installIntoPrefix({ prefix: prefix(key), name: CATALOG[key].name, spec: spec(key), update, label: `canvas CLI package '${key}' — managed by \`canvas package\`` });
}

/** What a placeholder says when its command is used before the package exists. */
export function placeholderModule(key) {
    const c = CATALOG[key];
    return {
        name: key,
        description: `${c.description} — not installed (\`canvas package install ${key}\`)`,
        placeholder: key,
        needsConnection: false,
        defaultAction: 'help',
        actions: [],
        submodules: [],
    };
}

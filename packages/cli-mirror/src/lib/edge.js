'use strict';

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exec, execSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { CANVAS_HOME } from '@augmentd-labs/canvas-cli-host/paths';
import { hasPM2, getProcessInfo, pm2Env, pm2Start } from '@augmentd-labs/canvas-cli-host/pm2';
import { CanvasError } from '@augmentd-labs/canvas-cli-host/errors';
import { PM2_INSTALL } from './pm2.js';
import { input, select, spinner } from '@augmentd-labs/canvas-cli-host/prompt';
import { installIntoPrefix, installedInPrefix } from '@augmentd-labs/canvas-cli-host/prefix-install';
import { readConfig, setEdgeBin } from './config.js';

const execAsync = promisify(exec);
const HERE = path.dirname(fileURLToPath(import.meta.url));

/*
 * The canvas-edge daemon: one process per device running every mirror whose
 * `client` is 'daemon' (real folders, no FUSE — macOS/Windows or by choice).
 * It reads the same mirrors.json this CLI writes; we talk to it over its
 * control socket and supervise it with pm2 under one fixed name.
 */

export const EDGE_PM2_NAME = 'canvas-edge';
export const EDGE_SOCKET = process.platform === 'win32' ? null : path.join(CANVAS_HOME, 'run', 'edge.sock');
export const EDGE_PORT = Number(process.env.CANVAS_EDGE_PORT) || 8802;

// canvas-edge ships as a self-contained artifact branch of the monorepo
// (scripts/pack-dist.mjs → `edge-dist`). The CLI installs it into its OWN
// prefix, ~/.canvas/edge, as an ordinary project dependency — not `npm -g`:
// global installs of a git package with bundled deps came out with half the
// package dirs empty (npm 11, silently), a plain install never did. No sudo,
// no PATH games, and `canvas remote mirror edge update` is just `npm update` there.
// CANVAS_EDGE_PACKAGE overrides the spec (a fork, a tag, the npm name later).
export const EDGE_PACKAGE = process.env.CANVAS_EDGE_PACKAGE || 'github:canvas-ui/canvas#edge-dist';
export const EDGE_PKG_NAME = '@augmentd-labs/canvas-edge';
export const EDGE_PREFIX = path.join(CANVAS_HOME, 'edge');
export const EDGE_INSTALL = 'canvas remote mirror edge install';

let npmGlobalRoot;
function npmRootGlobal() {
    if (npmGlobalRoot !== undefined) return npmGlobalRoot;
    try { npmGlobalRoot = String(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 })).trim() || null; }
    catch { npmGlobalRoot = null; }
    return npmGlobalRoot;
}

export function edgeBinary() {
    const globalRoot = npmRootGlobal();
    const configured = readConfig().edgeBin;
    const candidates = [
        process.env.CANVAS_EDGE_BIN,
        configured ? path.join(configured, 'bin', 'canvas-edge') : null,
        configured,
        // `canvas remote mirror edge install` → ~/.canvas/edge/node_modules/…
        path.join(EDGE_PREFIX, 'node_modules', EDGE_PKG_NAME, 'bin', 'canvas-edge'),
        // a global install someone did by hand
        globalRoot ? path.join(globalRoot, EDGE_PKG_NAME, 'bin', 'canvas-edge') : null,
        // Monorepo checkout (a compiled CLI has no such path).
        path.resolve(HERE, '../../../../../../runtimes/edge/bin/canvas-edge'),
    ].filter(Boolean);
    for (const c of candidates) {
        try { if (statSync(c).isFile()) return c; } catch { /* next */ }
    }
    return 'canvas-edge';
}

function request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        // No content-type without a body: Fastify rejects an empty JSON body with 400.
        const headers = body !== undefined ? { 'content-type': 'application/json' } : {};
        const opts = EDGE_SOCKET
            ? { socketPath: EDGE_SOCKET, path: urlPath, method, headers }
            : { host: '127.0.0.1', port: EDGE_PORT, path: urlPath, method, headers };
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(data || 'null'); } catch { json = data; }
                if (res.statusCode >= 400) reject(new CanvasError(json?.error || `canvas-edge ${res.statusCode}`));
                else resolve(json);
            });
        });
        req.on('error', (err) => reject(new CanvasError(`canvas-edge not running (${err.code || err.message})`)));
        req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
        if (body !== undefined) req.write(JSON.stringify(body));
        req.end();
    });
}

export async function edgeStatus() { return request('GET', '/status'); }
export async function edgeReload() { return request('POST', '/reload'); }
export async function edgeResync(id) { return request('POST', `/mirrors/${encodeURIComponent(id)}/resync`); }
export async function edgeRunning() { try { await edgeStatus(); return true; } catch { return false; } }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(pred, { timeout = 8000, step = 250 } = {}) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
        if (await pred()) return true;
        await sleep(step);
    }
    return pred();
}

export const EDGE_INSTALL_HINT = `canvas-edge not found. Run \`${EDGE_INSTALL}\` (fetches ${EDGE_PACKAGE} into ${EDGE_PREFIX}) or point CANVAS_EDGE_BIN at a checkout (runtimes/edge/bin/canvas-edge).`;

/** Install or update canvas-edge in ~/.canvas/edge (see cli-host/prefix-install). Returns the binary path. */
export async function installEdge({ update = false } = {}) {
    const dir = await installIntoPrefix({ prefix: EDGE_PREFIX, name: EDGE_PKG_NAME, spec: EDGE_PACKAGE, update, label: 'canvas-edge runtime managed by `canvas remote mirror edge`' });
    const bin = path.join(dir, 'bin', 'canvas-edge');
    if (!existsSync(bin)) throw new CanvasError(`${EDGE_PREFIX} installed, but ${bin} is missing`);
    return bin;
}

/** Version + revision of the installed runtime, or null. */
export function installedEdge() {
    const inst = installedInPrefix(EDGE_PREFIX, EDGE_PKG_NAME);
    return inst ? { ...inst, prefix: EDGE_PREFIX } : null;
}

/**
 * Preflight for daemon mirrors: true when canvas-edge can be started.
 * Interactively offers the GitHub install (npm -g) — the same shape as the
 * pm2 preflight, so a fresh device is fixed inside the wizard.
 */
export async function ensureEdge({ interactive = false, io } = {}) {
    if (await edgeAvailable()) return true;
    if (!interactive) return false;
    const choice = await select('canvas-edge (the folder sync daemon) is not installed on this device.', [
        { label: 'Install it now', value: 'install', hint: `${EDGE_PACKAGE} → ${EDGE_PREFIX}` },
        { label: 'Use a local monorepo checkout', value: 'local', hint: 'runtimes/edge — path is remembered in mirrors.json' },
        { label: 'Skip', value: 'skip', hint: 'set CANVAS_EDGE_BIN and run `canvas remote mirror start all` later' },
    ]);
    if (choice === 'local') {
        const raw = (await input({ message: 'Path to runtimes/edge (or the canvas-edge script)', placeholder: '~/Code/canvas/runtimes/edge' })).trim();
        const p = path.resolve(raw.replace(/^~(?=$|[\\/])/, os.homedir()));
        const bin = existsSync(path.join(p, 'bin', 'canvas-edge')) ? path.join(p, 'bin', 'canvas-edge') : existsSync(p) && !statSync(p).isDirectory() ? p : null;
        if (!bin) { io?.warn?.(`${p}: no bin/canvas-edge there`); return false; }
        setEdgeBin(bin);
        io?.success?.(`canvas-edge: ${bin}`);
        return true;
    }
    if (choice !== 'install') return false;
    const s = spinner();
    s.start(`Installing canvas-edge (${EDGE_PACKAGE}) into ${EDGE_PREFIX}…`);
    try {
        await installEdge();
    } catch (err) {
        s.stop('canvas-edge install failed');
        io?.warn?.(`${err.message}\nRetry with \`${EDGE_INSTALL}\` once the cause is fixed, then \`canvas remote mirror start all\`.`);
        return false;
    }
    npmGlobalRoot = undefined;
    if (await edgeAvailable()) { s.stop('canvas-edge installed'); return true; }
    s.stop('canvas-edge installed, but not resolvable');
    io?.warn?.('Check `npm root -g` / your PATH, or set CANVAS_EDGE_BIN.');
    return false;
}

/** Is there a canvas-edge we can start? (absolute candidate found, or resolvable on PATH) */
export async function edgeAvailable() {
    const bin = edgeBinary();
    if (path.isAbsolute(bin)) return true;
    try { await execAsync(process.platform === 'win32' ? `where ${bin}` : `command -v ${bin}`); return true; }
    catch { return false; }
}

function spawnError(err, bin) {
    if (err.code !== 'ENOENT') return `canvas-edge failed to start: ${err.message}`;
    return path.isAbsolute(bin) ? 'canvas-edge needs Node.js on PATH (`node` was not found).' : EDGE_INSTALL_HINT;
}

/** Detached, unsupervised daemon (logs to ~/.canvas/var/log/canvas-edge.log). */
function spawnDetached() {
    const bin = edgeBinary();
    return new Promise((resolve, reject) => {
        let child;
        try {
            // canvas-edge is a Node script. A compiled CLI's execPath is the CLI itself, so use `node` from PATH there.
            const runtime = process.versions?.bun ? 'node' : process.execPath;
            child = path.isAbsolute(bin)
                ? spawn(runtime, [bin], { detached: true, stdio: 'ignore', env: { ...process.env } })
                : spawn(bin, [], { detached: true, stdio: 'ignore', env: { ...process.env }, shell: process.platform === 'win32' });
        } catch (err) {
            return reject(new CanvasError(spawnError(err, bin)));
        }
        child.once('error', (err) => reject(new CanvasError(spawnError(err, bin))));
        child.once('spawn', () => { child.unref(); resolve(); });
    });
}

/**
 * Make sure one canvas-edge runs for this device and picks up mirrors.json.
 * `managed: 'pm2'` supervises it (login start, crash restart); `'manual'`
 * starts it detached when it is not already answering on the control socket.
 */
export async function ensureEdgeService(io, { managed = 'pm2' } = {}) {
    if (!(await edgeAvailable())) throw new CanvasError(EDGE_INSTALL_HINT);
    if (managed === 'pm2') {
        if (!(await hasPM2())) throw new CanvasError(`PM2 not installed. \`${PM2_INSTALL}\` (or start unsupervised with --no-service)`);
        const existing = await getProcessInfo(EDGE_PM2_NAME);
        if (existing && existing.pm2_env?.status === 'online') {
            await edgeReload().catch(() => {});
            return { started: false };
        }
        if (existing) await execAsync(`pm2 delete ${EDGE_PM2_NAME}`).catch(() => {});
        const cfg = {
            name: EDGE_PM2_NAME, script: edgeBinary(), args: ['--foreground'], interpreter: 'node',
            env: pm2Env(), time: true, autorestart: true, max_restarts: 10, min_uptime: '10s', restart_delay: 5000,
        };
        await pm2Start(cfg);
        await execAsync('pm2 save').catch(() => {});
        io?.info?.('canvas-edge started under pm2 (run `pm2 startup` once for login start).');
        return { started: true };
    }
    if (await edgeRunning()) {
        await edgeReload().catch(() => {});
        return { started: false };
    }
    await spawnDetached();
    if (!(await waitFor(edgeRunning))) throw new CanvasError('canvas-edge did not come up — see ~/.canvas/var/log/canvas-edge.log (or run `canvas-edge --foreground`)');
    return { started: true };
}

/** Full restart: pm2 restart when supervised, else graceful shutdown + detached respawn. */
export async function restartEdgeService(io, { managed = 'pm2' } = {}) {
    if (managed === 'pm2' && (await hasPM2())) {
        // Not `pm2 restart`: that reuses the script path and env the process
        // was created with, so a moved canvas-edge (the server checkout → the
        // edge-dist install) would stay broken. Re-create from the current lookup.
        const existing = await getProcessInfo(EDGE_PM2_NAME);
        if (existing) {
            await execAsync(`pm2 stop ${EDGE_PM2_NAME}`).catch(() => {});
            await execAsync(`pm2 delete ${EDGE_PM2_NAME}`).catch(() => {});
        }
        return { ...(await ensureEdgeService(io, { managed })), restarted: Boolean(existing) };
    }
    if (await edgeRunning()) {
        await request('POST', '/shutdown').catch(() => null);
        await waitFor(async () => !(await edgeRunning()));
    }
    return { ...(await ensureEdgeService(io, { managed: 'manual' })), restarted: true };
}

export async function stopEdgeService() {
    let stopped = false;
    if (await hasPM2()) {
        const existing = await getProcessInfo(EDGE_PM2_NAME);
        if (existing) {
            await execAsync(`pm2 stop ${EDGE_PM2_NAME}`).catch(() => {});
            await execAsync(`pm2 delete ${EDGE_PM2_NAME}`).catch(() => {});
            stopped = true;
        }
    }
    if (await edgeRunning()) {
        await request('POST', '/shutdown').catch(() => null);
        await waitFor(async () => !(await edgeRunning()));
        stopped = true;
    }
    return stopped;
}

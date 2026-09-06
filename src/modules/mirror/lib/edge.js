'use strict';

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { CANVAS_HOME } from '../../../core/paths.js';
import { hasPM2, getProcessInfo, pm2Env, pm2Start } from '../../server/lib/pm2.js';
import { CanvasError } from '../../../core/errors.js';
import { PM2_INSTALL } from './pm2.js';

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

export function edgeBinary() {
    const candidates = [
        process.env.CANVAS_EDGE_BIN,
        process.env.CANVAS_SERVER_ROOT ? path.join(process.env.CANVAS_SERVER_ROOT, 'bin', 'canvas-edge') : null,
        path.resolve(HERE, '../../../../../../../canvas-server/bin/canvas-edge'),
        path.join(os.homedir(), '.canvas', 'server', 'bin', 'canvas-edge'),
    ].filter(Boolean);
    for (const c of candidates) if (existsSync(c)) return c;
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

export const EDGE_INSTALL_HINT = 'canvas-edge not found. Install canvas-server (`npm install -g @augmentd-labs/canvas-server`) or point CANVAS_EDGE_BIN / CANVAS_SERVER_ROOT at a checkout.';

/** Is there a canvas-edge we can start? (absolute candidate found, or resolvable on PATH) */
export async function edgeAvailable() {
    const bin = edgeBinary();
    if (path.isAbsolute(bin)) return true;
    try { await execAsync(process.platform === 'win32' ? `where ${bin}` : `command -v ${bin}`); return true; }
    catch { return false; }
}

/** Detached, unsupervised daemon (logs to ~/.canvas/var/log/canvas-edge.log). */
function spawnDetached() {
    const bin = edgeBinary();
    return new Promise((resolve, reject) => {
        let child;
        try {
            // A compiled CLI runs under bun; a script file still needs a JS runtime, so hand it to whatever runs us.
            child = path.isAbsolute(bin)
                ? spawn(process.execPath, [bin], { detached: true, stdio: 'ignore', env: { ...process.env } })
                : spawn(bin, [], { detached: true, stdio: 'ignore', env: { ...process.env }, shell: process.platform === 'win32' });
        } catch (err) {
            return reject(new CanvasError(err.code === 'ENOENT' ? EDGE_INSTALL_HINT : `canvas-edge failed to start: ${err.message}`));
        }
        child.once('error', (err) => reject(new CanvasError(err.code === 'ENOENT' ? EDGE_INSTALL_HINT : `canvas-edge failed to start: ${err.message}`)));
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
        const existing = await getProcessInfo(EDGE_PM2_NAME);
        if (existing) { await execAsync(`pm2 restart ${EDGE_PM2_NAME}`); return { restarted: true }; }
        return ensureEdgeService(io, { managed });
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

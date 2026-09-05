'use strict';

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { CANVAS_HOME } from '../../../core/paths.js';
import { hasPM2, getProcessInfo } from '../../server/lib/pm2.js';
import { CanvasError } from '../../../core/errors.js';

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
        const opts = EDGE_SOCKET
            ? { socketPath: EDGE_SOCKET, path: urlPath, method, headers: { 'content-type': 'application/json' } }
            : { host: '127.0.0.1', port: EDGE_PORT, path: urlPath, method, headers: { 'content-type': 'application/json' } };
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

export async function ensureEdgeService(io) {
    if (!(await hasPM2())) throw new CanvasError('PM2 not installed. `npm install -g pm2`');
    const existing = await getProcessInfo(EDGE_PM2_NAME);
    if (existing && existing.pm2_env?.status === 'online') {
        await edgeReload().catch(() => {});
        return { started: false };
    }
    if (existing) await execAsync(`pm2 delete ${EDGE_PM2_NAME}`).catch(() => {});
    const cfg = {
        name: EDGE_PM2_NAME, script: edgeBinary(), args: ['--foreground'], interpreter: 'node',
        env: { ...process.env }, time: true, autorestart: true, max_restarts: 10, min_uptime: '10s', restart_delay: 5000,
    };
    await execAsync(`pm2 start '${JSON.stringify(cfg).replace(/'/g, '\\\'')}'`);
    await execAsync('pm2 save').catch(() => {});
    io?.info?.('canvas-edge started under pm2 (run `pm2 startup` once for login start).');
    return { started: true };
}

export async function stopEdgeService() {
    const existing = await getProcessInfo(EDGE_PM2_NAME);
    if (!existing) return false;
    await execAsync(`pm2 stop ${EDGE_PM2_NAME}`).catch(() => {});
    await execAsync(`pm2 delete ${EDGE_PM2_NAME}`).catch(() => {});
    return true;
}

'use strict';

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const HERE = path.dirname(fileURLToPath(import.meta.url));

export const PM2_APP = 'canvas-server';

export function findServerRoot() {
    if (process.env.CANVAS_SERVER_ROOT) {
        const p = path.resolve(process.env.CANVAS_SERVER_ROOT);
        if (isValidRoot(p)) return p;
    }
    // src/ui/cli/src/modules/server/lib → up 6 = canvas-server repo root
    const repoRoot = path.resolve(HERE, '../../../../../../..');
    if (isValidRoot(repoRoot)) return repoRoot;
    const cliRoot = path.resolve(HERE, '../../../../..');
    const sub = path.join(cliRoot, 'server');
    if (isValidRoot(sub)) return sub;
    return null;
}

function isValidRoot(dir) {
    try {
        const pkg = path.join(dir, 'package.json');
        const script = path.join(dir, 'src/Server.js');
        if (!existsSync(pkg) || !existsSync(script)) return false;
        const j = JSON.parse(readFileSync(pkg, 'utf8'));
        return j.name === 'canvas-server' || j.name === '@canvas/server';
    } catch { return false; }
}

export async function hasPM2() {
    try { await execAsync('pm2 --version'); return true; }
    catch { return false; }
}

export async function getProcessInfo() {
    try {
        const { stdout } = await execAsync('pm2 jlist');
        const procs = JSON.parse(stdout);
        return procs.find((p) => p.name === PM2_APP) || null;
    } catch { return null; }
}

export function formatUptime(ts) {
    if (!ts) return 'N/A';
    const u = Date.now() - ts;
    const s = Math.floor(u / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

export function formatMemory(b) {
    if (!b) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${Math.round((b / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
}

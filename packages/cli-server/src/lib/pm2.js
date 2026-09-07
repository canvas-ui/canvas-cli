'use strict';

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CANVAS_HOME } from '@augmentd-labs/canvas-cli-host/paths';

export { hasPM2, getProcessInfo, pm2Env, pm2Start, pm2Stop, pm2Save, formatUptime, formatMemory } from '@augmentd-labs/canvas-cli-host/pm2';

export const PM2_APP = 'canvas-server';
export const SERVER_HOME = path.join(CANVAS_HOME, 'server');
export const SERVER_REPO = process.env.CANVAS_SERVER_GIT || 'https://github.com/canvas-ui/canvas-server.git';

/** A canvas-server checkout: CANVAS_SERVER_ROOT, the CLI-managed clone, or a sibling of the monorepo. */
export function findServerRoot() {
    const candidates = [
        process.env.CANVAS_SERVER_ROOT,
        SERVER_HOME,
        // <container>/canvas-server next to the monorepo (dev)
        path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../../canvas-server'),
    ].filter(Boolean);
    for (const c of candidates) if (isValidRoot(path.resolve(c))) return path.resolve(c);
    return null;
}

function isValidRoot(dir) {
    try {
        const pkg = path.join(dir, 'package.json');
        // src/init.js is the package entry point (Server.js is a non-starting singleton).
        if (!existsSync(pkg) || !existsSync(path.join(dir, 'src/init.js'))) return false;
        const j = JSON.parse(readFileSync(pkg, 'utf8'));
        return j.name === 'canvas-server' || j.name === '@canvas/server' || j.name === '@augmentd-labs/canvas-server';
    } catch { return false; }
}

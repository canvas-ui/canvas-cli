'use strict';

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { CanvasError } from '@augmentd-labs/canvas-cli-host/errors';
import { PM2_APP, SERVER_HOME, SERVER_REPO, getProcessInfo, hasPM2 } from './pm2.js';
import installAction from '../actions/install.js';
import restartAction from '../actions/restart.js';

const execFileAsync = promisify(execFile);

/*
 * What `canvas update` sees from this package: the CLI-managed canvas-server
 * checkout in ~/.canvas/server. Installed = its HEAD; latest = the remote
 * branch HEAD (`git ls-remote`, no GitHub API); update = the install action
 * (`git pull --ff-only` + `npm install`); restart = pm2 restart when it runs.
 */
async function git(args, cwd = SERVER_HOME) {
    const { stdout } = await execFileAsync('git', args, { cwd, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
    return String(stdout).trim();
}

export const serverService = {
    id: 'server',
    label: 'canvas-server',
    description: `local canvas-server checkout (${SERVER_REPO} → ${SERVER_HOME})`,
    async installed() {
        if (!existsSync(path.join(SERVER_HOME, '.git'))) return null;
        let version = null;
        try { version = JSON.parse(readFileSync(path.join(SERVER_HOME, 'package.json'), 'utf8')).version || null; } catch { /* no manifest */ }
        const rev = await git(['rev-parse', '--short', 'HEAD']).catch(() => null);
        return { version, rev, dir: SERVER_HOME };
    },
    async latest() {
        const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'main');
        const out = await git(['ls-remote', SERVER_REPO, `refs/heads/${branch}`]).catch((err) => { throw new CanvasError(`git ls-remote ${SERVER_REPO}: ${err.message.split('\n')[0]}`); });
        const sha = out.split(/\s+/)[0];
        return sha ? { rev: sha.slice(0, 7) } : null;
    },
    async update({ io, onStep } = {}) {
        onStep?.(`git pull + npm install in ${SERVER_HOME}…`);
        const before = await this.installed();
        await installAction.run({ flags: {}, args: {}, io: io || { info() {}, success() {}, warn() {} } });
        const after = await this.installed();
        return { before: before?.rev || null, after: after ? `${after.version || ''} (${after.rev})`.trim() : null };
    },
    async restart({ io } = {}) {
        if (!(await hasPM2()) || !(await getProcessInfo(PM2_APP))) return { skipped: 'not running under pm2' };
        await restartAction.run({ io: io || { info() {}, success() {}, warn() {} } });
        return { restarted: true };
    },
};

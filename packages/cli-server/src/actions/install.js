'use strict';

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { CanvasError } from '@augmentd-labs/canvas-cli-host/errors';
import { spinner } from '@augmentd-labs/canvas-cli-host/prompt';
import { SERVER_HOME, SERVER_REPO, findServerRoot } from '../lib/pm2.js';

const execFileAsync = promisify(execFile);

/*
 * canvas-server is not on npm; the supported install is a git checkout plus
 * `npm install` (its git dependencies refresh themselves on postinstall).
 * The CLI keeps that checkout in ~/.canvas/server; `install` again = update.
 */
export default {
    name: 'install',
    description: `Clone (or update) canvas-server into ${SERVER_HOME} and install its dependencies`,
    flags: { branch: 'string' },
    async run({ flags, io }) {
        const existing = findServerRoot();
        if (existing && existing !== SERVER_HOME) io.info(`A checkout already exists at ${existing} (CANVAS_SERVER_ROOT / dev); installing the managed one anyway`);
        const s = spinner();
        const fresh = !existsSync(path.join(SERVER_HOME, '.git'));
        s.start(fresh ? `Cloning ${SERVER_REPO} into ${SERVER_HOME}…` : `Updating ${SERVER_HOME}…`);
        try {
            if (fresh) await execFileAsync('git', ['clone', '--depth', '1', ...(flags.branch ? ['--branch', flags.branch] : []), SERVER_REPO, SERVER_HOME], { timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
            else await execFileAsync('git', ['pull', '--ff-only'], { cwd: SERVER_HOME, timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
            s.message('Installing dependencies (npm install, a few minutes)…');
            await execFileAsync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: SERVER_HOME, timeout: 1200000, maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' });
        } catch (err) {
            s.stop('canvas-server install failed');
            const tail = String(err.stderr || err.message || '').trim().split('\n').filter((l) => !/TAR_ENTRY_ERROR|deprecated|EBADENGINE/.test(l)).slice(-4).join('\n');
            throw new CanvasError(`${tail}\nFinish by hand: git clone ${SERVER_REPO} ${SERVER_HOME} && cd ${SERVER_HOME} && npm install`);
        }
        s.stop(`canvas-server ready at ${SERVER_HOME}`);
        io.success('Start it with `canvas server start`');
    },
};

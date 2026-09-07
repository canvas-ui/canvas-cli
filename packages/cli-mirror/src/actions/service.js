'use strict';

import { UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { listMirrors, upsertMirror } from '../lib/config.js';
import { STARTUP_HINT, ensurePM2, requirePM2, save, startProcess, stopProcess } from '../lib/pm2.js';
import { ensureEdgeService, stopEdgeService } from '../lib/edge.js';

export default {
    name: 'service',
    description: 'pm2 supervision for all mirrors: `service install|uninstall`',
    positional: [{ name: 'op', required: true }],
    async run({ args, io }) {
        const op = String(args.op);
        if (!['install', 'uninstall'].includes(op)) throw new UsageError('op must be install | uninstall');
        if (op === 'install' && !(await ensurePM2({ interactive: process.stdin.isTTY, io }))) await requirePM2();
        const mirrors = listMirrors();
        if (mirrors.length === 0) throw new UsageError('No mirrors configured');
        const daemon = mirrors.filter((m) => m.client === 'daemon');
        if (daemon.length) {
            if (op === 'install') {
                await stopEdgeService().catch(() => false);
                await ensureEdgeService(io, { managed: 'pm2' });
            } else {
                await stopEdgeService().catch(() => false);
                await ensureEdgeService(io, { managed: 'manual' }).catch((e) => io.warn(e.message));
            }
            for (const mirror of daemon) upsertMirror({ ...mirror, managed: op === 'install' ? 'pm2' : 'manual' });
            io.success(`canvas-edge ${op === 'install' ? 'now runs under pm2' : 'runs detached'} (${daemon.length} folder(s))`);
        }
        for (const mirror of mirrors.filter((m) => m.client !== 'daemon')) {
            if (op === 'install') {
                const { name, started } = await startProcess(mirror);
                upsertMirror({ ...mirror, managed: 'pm2' });
                io.success(`${started ? 'Started' : 'Running'}: ${name}`);
            } else {
                const { name } = await stopProcess(mirror);
                upsertMirror({ ...mirror, managed: 'manual' });
                io.success(`Removed from pm2: ${name}`);
            }
        }
        await save();
        if (op === 'install') io.info(STARTUP_HINT);
    },
};

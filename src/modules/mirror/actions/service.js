'use strict';

import { UsageError } from '../../../core/errors.js';
import { listMirrors, upsertMirror } from '../lib/config.js';
import { STARTUP_HINT, requirePM2, save, startProcess, stopProcess } from '../lib/pm2.js';

export default {
    name: 'service',
    description: 'pm2 supervision for all mirrors: `service install|uninstall`',
    positional: [{ name: 'op', required: true }],
    async run({ args, io }) {
        const op = String(args.op);
        if (!['install', 'uninstall'].includes(op)) throw new UsageError('op must be install | uninstall');
        await requirePM2();
        const mirrors = listMirrors();
        if (mirrors.length === 0) throw new UsageError('No mirrors configured');
        for (const mirror of mirrors) {
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

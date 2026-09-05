'use strict';

import { spawn } from 'node:child_process';
import { UsageError } from '../../../core/errors.js';
import { findMirror } from '../lib/config.js';
import { processName, requirePM2 } from '../lib/pm2.js';

export default {
    name: 'logs',
    description: 'Stream a pm2-managed mirror\'s logs',
    positional: [{ name: 'workspace', required: true }],
    flags: { lines: 'string' },
    async run({ args, flags }) {
        const mirror = findMirror(args.workspace);
        if (!mirror) throw new UsageError(`No mirror for '${args.workspace}'`);
        if (mirror.managed !== 'pm2') throw new UsageError('This mirror is not pm2-managed; see ~/.local/state/canvas-fuse/mounts/*.log');
        await requirePM2();
        return new Promise((resolve) => {
            const p = spawn('pm2', ['logs', processName(mirror), '--lines', flags.lines || '50'], { stdio: 'inherit' });
            process.on('SIGINT', () => p.kill('SIGINT'));
            p.on('close', () => resolve());
        });
    },
};

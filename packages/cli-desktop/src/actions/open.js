'use strict';

import { spawn } from 'node:child_process';
import { CanvasError } from '@augmentd-labs/canvas-cli-host/errors';
import { installedPath } from '../lib/release.js';

export default {
    name: 'open',
    aliases: ['launch', 'start'],
    description: 'Launch the downloaded desktop app (detached)',
    async run({ io }) {
        const p = installedPath();
        if (!p) throw new CanvasError('Desktop app not installed — run `canvas desktop install`');
        const cmd = process.platform === 'darwin' ? ['open', [p]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', p]] : [p, []];
        const child = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' });
        child.on('error', (e) => io.error(`launch failed: ${e.message}`));
        child.unref();
        io.success(`Launched ${p}`);
    },
};

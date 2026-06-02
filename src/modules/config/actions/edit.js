'use strict';

import { spawn } from 'node:child_process';
import { config } from '../../../core/storage.js';

export default {
    name: 'edit',
    description: 'Open config in $EDITOR',
    async run() {
        const editor = process.env.EDITOR || 'nano';
        return new Promise((resolve) => {
            const child = spawn(editor, [config.path], { stdio: 'inherit' });
            child.on('close', () => resolve());
        });
    },
};

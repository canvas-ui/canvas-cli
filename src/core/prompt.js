'use strict';

import { createInterface } from 'node:readline';

export function input(prompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(prompt, (a) => { rl.close(); resolve(a); }));
}

export function password(prompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = function () {
        rl.output.write('\x1B[2K\x1B[200D' + prompt + '*'.repeat(rl.line.length));
    };
    return new Promise((resolve) => rl.question(prompt, (a) => {
        rl.output.write('\n'); rl.close(); resolve(a);
    }));
}

export async function yesNo(prompt, defaultVal = false) {
    const a = (await input(`${prompt} (${defaultVal ? 'Y/n' : 'y/N'}): `)).trim().toLowerCase();
    if (a === '') return defaultVal;
    return a === 'y' || a === 'yes';
}

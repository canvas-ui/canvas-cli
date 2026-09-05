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

/**
 * @param {string} prompt
 * @param {Array<{label: string, value: *}>} options
 * @returns {Promise<*>} selected value
 */
export async function select(prompt, options) {
    process.stdout.write(`\n${prompt}\n`);
    options.forEach((opt, i) => process.stdout.write(`  ${i + 1}. ${opt.label}\n`));
    const raw = (await input(`Choice [1-${options.length}]: `)).trim();
    const idx = parseInt(raw, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= options.length) return options[0].value;
    return options[idx].value;
}

/**
 * Pick several. Accepts numbers ("1,3"), ranges ("2-4"), "all" / "*", or
 * empty for the default. Returns the chosen values in option order.
 * @param {string} prompt
 * @param {Array<{label: string, value: *}>} options
 * @param {{ defaultAll?: boolean }} [opts]
 */
export async function multiSelect(prompt, options, { defaultAll = false } = {}) {
    process.stdout.write(`\n${prompt}\n`);
    options.forEach((opt, i) => process.stdout.write(`  ${i + 1}. ${opt.label}\n`));
    const raw = (await input(`Choice [1-${options.length}, e.g. 1,3 or 2-4, "all"${defaultAll ? ', empty = all' : ', empty = none'}]: `)).trim();
    return parseSelection(raw, options.length, { defaultAll }).map((i) => options[i].value);
}

/** Pure part of multiSelect: "1,3-4,all" → zero-based indices, sorted, unique. */
export function parseSelection(raw, count, { defaultAll = false } = {}) {
    const text = String(raw ?? '').trim().toLowerCase();
    const all = Array.from({ length: count }, (_, i) => i);
    if (text === '') return defaultAll ? all : [];
    if (text === 'all' || text === '*') return all;
    const picked = new Set();
    for (const part of text.split(/[\s,]+/).filter(Boolean)) {
        const m = part.match(/^(\d+)(?:-(\d+))?$/);
        if (!m) continue;
        const from = parseInt(m[1], 10);
        const to = m[2] ? parseInt(m[2], 10) : from;
        for (let n = Math.min(from, to); n <= Math.max(from, to); n++) {
            if (n >= 1 && n <= count) picked.add(n - 1);
        }
    }
    return [...picked].sort((a, b) => a - b);
}

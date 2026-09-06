'use strict';

import { createInterface } from 'node:readline';
import * as clack from '@clack/prompts';
import { CanvasError } from './errors.js';

/*
 * Interactive prompts. On a terminal they render through @clack/prompts
 * (arrow-key selects, checkboxes, masked passwords, spinners — the same look
 * on Linux, macOS and Windows). Without a TTY (pipes, CI) every helper falls
 * back to plain readline so scripted runs keep working.
 *
 * Ctrl-C inside a prompt throws PromptCancelled; the CLI turns that into a
 * quiet exit (130) instead of an error banner.
 */

export class PromptCancelled extends CanvasError {
    constructor() {
        super('Cancelled', { code: 'CANCELLED' });
        this.name = 'PromptCancelled';
    }
}

export const isTTY = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

function guard(value) {
    if (clack.isCancel(value)) {
        clack.cancel('Cancelled.');
        throw new PromptCancelled();
    }
    return value;
}

/** "Short name [hub]: " → { message: 'Short name', defaultValue: 'hub' } */
function legacy(prompt) {
    let message = String(prompt || '').replace(/[:\s]+$/, '');
    let defaultValue;
    const m = message.match(/^(.*?)\s*\[([^\]]*)\]$/);
    if (m) { message = m[1]; defaultValue = m[2]; }
    return { message, defaultValue };
}

// ---------------------------------------------------------------- readline fallback

function rlAsk(prompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(prompt, (a) => { rl.close(); resolve(a); }));
}

function rlPassword(prompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = function () {
        rl.output.write('\x1B[2K\x1B[200D' + prompt + '*'.repeat(rl.line.length));
    };
    return new Promise((resolve) => rl.question(prompt, (a) => {
        rl.output.write('\n'); rl.close(); resolve(a);
    }));
}

// ---------------------------------------------------------------- flow

export function intro(title) { if (isTTY()) clack.intro(title); else process.stdout.write(`${title}\n`); }
export function outro(message) { if (isTTY()) clack.outro(message); else process.stdout.write(`${message}\n`); }
export function note(message, title) { if (isTTY()) clack.note(message, title); else process.stdout.write(`${title ? title + '\n' : ''}${message}\n`); }

export const log = {
    info: (m) => (isTTY() ? clack.log.info(m) : process.stdout.write(`${m}\n`)),
    success: (m) => (isTTY() ? clack.log.success(m) : process.stdout.write(`${m}\n`)),
    warn: (m) => (isTTY() ? clack.log.warn(m) : process.stderr.write(`${m}\n`)),
    error: (m) => (isTTY() ? clack.log.error(m) : process.stderr.write(`${m}\n`)),
    step: (m) => (isTTY() ? clack.log.step(m) : process.stdout.write(`${m}\n`)),
    message: (m) => (isTTY() ? clack.log.message(m) : process.stdout.write(`${m}\n`)),
};

/** `const s = spinner(); s.start('…'); s.stop('done')` — a no-op pair off a TTY. */
export function spinner() {
    if (isTTY()) return clack.spinner();
    return {
        start: (m) => { if (m) process.stdout.write(`${m}\n`); },
        stop: (m) => { if (m) process.stdout.write(`${m}\n`); },
        message: () => {},
    };
}

// ---------------------------------------------------------------- questions

/**
 * Free text. `input('Email: ')` and `input('Name [suggested]: ')` keep working;
 * the object form exposes placeholder/validate.
 * @param {string|{message:string, placeholder?:string, defaultValue?:string, initialValue?:string, validate?:(v:string)=>string|void}} prompt
 * @returns {Promise<string>}
 */
export async function input(prompt) {
    const opts = typeof prompt === 'string' ? legacy(prompt) : { ...prompt };
    if (!isTTY()) {
        const raw = await rlAsk(`${opts.message}${opts.defaultValue != null ? ` [${opts.defaultValue}]` : ''}: `);
        return raw.trim() || opts.defaultValue || '';
    }
    const value = guard(await clack.text({
        message: opts.message,
        placeholder: opts.placeholder ?? opts.defaultValue,
        defaultValue: opts.defaultValue,
        initialValue: opts.initialValue,
        validate: opts.validate,
    }));
    return String(value ?? '');
}

export async function password(prompt) {
    const { message } = typeof prompt === 'string' ? legacy(prompt) : prompt;
    if (!isTTY()) return rlPassword(`${message}: `);
    return String(guard(await clack.password({ message })) ?? '');
}

/** Accepts the old `(prompt, defaultVal)` signature. */
export async function yesNo(prompt, defaultVal = false) {
    const { message } = typeof prompt === 'string' ? legacy(prompt) : prompt;
    if (!isTTY()) {
        const a = (await rlAsk(`${message} (${defaultVal ? 'Y/n' : 'y/N'}): `)).trim().toLowerCase();
        if (a === '') return defaultVal;
        return a === 'y' || a === 'yes';
    }
    return Boolean(guard(await clack.confirm({ message, initialValue: defaultVal })));
}
export const confirm = yesNo;

/**
 * @param {string} prompt
 * @param {Array<{label: string, value: *, hint?: string}>} options
 * @param {{ initialValue?: * }} [opts]
 * @returns {Promise<*>} selected value
 */
export async function select(prompt, options, { initialValue } = {}) {
    if (!isTTY()) {
        process.stdout.write(`\n${prompt}\n`);
        options.forEach((opt, i) => process.stdout.write(`  ${i + 1}. ${opt.label}${opt.hint ? `  (${opt.hint})` : ''}\n`));
        const raw = (await rlAsk(`Choice [1-${options.length}]: `)).trim();
        const idx = parseInt(raw, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= options.length) return initialValue ?? options[0].value;
        return options[idx].value;
    }
    return guard(await clack.select({
        message: prompt,
        options: options.map((o) => ({ value: o.value, label: o.label, hint: o.hint })),
        initialValue: initialValue ?? options[0]?.value,
    }));
}

/**
 * Pick several (space toggles, a/i select all/invert). Off a TTY it accepts
 * numbers ("1,3"), ranges ("2-4"), "all" / "*", or empty for the default.
 * Returns the chosen values in option order.
 * @param {string} prompt
 * @param {Array<{label: string, value: *, hint?: string}>} options
 * @param {{ defaultAll?: boolean, initialValues?: Array<*>, required?: boolean }} [opts]
 */
export async function multiSelect(prompt, options, { defaultAll = false, initialValues, required = false } = {}) {
    if (!isTTY()) {
        process.stdout.write(`\n${prompt}\n`);
        options.forEach((opt, i) => process.stdout.write(`  ${i + 1}. ${opt.label}${opt.hint ? `  (${opt.hint})` : ''}\n`));
        const raw = (await rlAsk(`Choice [1-${options.length}, e.g. 1,3 or 2-4, "all"${defaultAll ? ', empty = all' : ', empty = none'}]: `)).trim();
        return parseSelection(raw, options.length, { defaultAll }).map((i) => options[i].value);
    }
    const picked = guard(await clack.multiselect({
        message: prompt,
        options: options.map((o) => ({ value: o.value, label: o.label, hint: o.hint })),
        initialValues: initialValues ?? (defaultAll ? options.map((o) => o.value) : []),
        required,
    }));
    const set = new Set(picked);
    return options.filter((o) => set.has(o.value)).map((o) => o.value);
}

/** Pure part of the non-TTY multiSelect: "1,3-4,all" → zero-based indices, sorted, unique. */
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

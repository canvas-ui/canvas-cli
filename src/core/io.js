'use strict';

import chalk from 'chalk';
import Table from 'cli-table3';

const FORMATS = new Set(['table', 'json', 'csv', 'raw']);

export function createIO({ format = 'table', raw = false, quiet = false } = {}) {
    const fmt = raw ? 'raw' : (FORMATS.has(format) ? format : 'table');

    return {
        format: fmt,
        quiet,

        output(payload, { schema, columns } = {}) {
            if (payload == null) return;
            if (fmt === 'json' || fmt === 'raw') {
                process.stdout.write(JSON.stringify(payload, null, fmt === 'raw' ? 0 : 2) + '\n');
                return;
            }
            const rows = Array.isArray(payload) ? payload : [payload];
            if (rows.length === 0) {
                if (!quiet) console.log(chalk.dim('(empty)'));
                return;
            }
            const cols = columns || schema || Object.keys(rows[0] || {});
            if (fmt === 'csv') {
                process.stdout.write(cols.join(',') + '\n');
                for (const r of rows) {
                    process.stdout.write(cols.map((c) => csvEscape(r?.[c])).join(',') + '\n');
                }
                return;
            }
            const table = new Table({ head: cols.map((c) => chalk.bold(c)) });
            for (const r of rows) {
                table.push(cols.map((c) => formatCell(r?.[c])));
            }
            console.log(table.toString());
        },

        print(...args) { if (!quiet) console.log(...args); },
        info(msg) { if (!quiet) console.log(chalk.dim(msg)); },
        success(msg) { if (!quiet) console.log(chalk.green(msg)); },
        warn(msg) { console.warn(chalk.yellow(msg)); },
        error(msg) { console.error(chalk.red(msg)); },
    };
}

function csvEscape(v) {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatCell(v) {
    if (v == null) return chalk.dim('-');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

export function readStdin() {
    return new Promise((resolve) => {
        if (process.stdin.isTTY) return resolve(null);
        const chunks = [];
        process.stdin.on('data', (d) => chunks.push(d));
        process.stdin.on('end', () => resolve(chunks.join('')));
        process.stdin.on('error', () => resolve(null));
    });
}

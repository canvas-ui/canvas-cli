'use strict';

import chalk from 'chalk';
import Table from 'cli-table3';

const FORMATS = new Set(['table', 'json', 'csv', 'raw']);

/**
 * A column is either a plain key (`'id'`), a dot path into the row
 * (`'data.title'`), or a spec:
 *
 *   { key: 'data.content', label: 'preview', width: 40, format: 'text' }
 *   { label: 'where', get: (row) => row.locations?.[0]?.url, format: 'url' }
 *
 * Formats are the small set of things terminal tables actually need: dates
 * that fit, byte counts a human reads, arrays joined, long text clipped.
 * Everything renders through one path so table and csv can never disagree.
 */
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
            const specs = normalizeColumns(columns || schema || Object.keys(rows[0] || {}));

            if (fmt === 'csv') {
                process.stdout.write(specs.map((s) => s.label).join(',') + '\n');
                for (const r of rows) {
                    // CSV is for machines: formatted (a tag list is a string,
                    // not a JSON array) but never clipped or coloured, and
                    // dates stay ISO so they sort and parse.
                    process.stdout.write(specs.map((s) => csvEscape(csvValue(r, s))).join(',') + '\n');
                }
                return;
            }

            const table = new Table({
                head: specs.map((s) => chalk.cyan.bold(s.label)),
                style: { border: ['cyan'] },
            });
            for (const r of rows) table.push(specs.map((s) => renderCell(r, s)));
            console.log(table.toString());
        },

        /**
         * One record as label/value pairs — for `get`/`show`, where a row of 20
         * columns is unreadable but the same data down the page is not.
         */
        detail(row, { columns, title } = {}) {
            if (row == null) return;
            if (fmt === 'json' || fmt === 'raw') {
                process.stdout.write(JSON.stringify(row, null, fmt === 'raw' ? 0 : 2) + '\n');
                return;
            }
            const specs = normalizeColumns(columns || Object.keys(row));
            if (title && !quiet) console.log(chalk.bold(title));
            const width = Math.max(...specs.map((s) => s.label.length));
            for (const spec of specs) {
                const value = renderCell(row, { ...spec, width: undefined });
                if (value === chalk.dim('-')) continue;
                console.log(`${chalk.cyan(spec.label.padEnd(width))}  ${value}`);
            }
        },

        print(...args) { if (!quiet) console.log(...args); },
        info(msg) { if (!quiet) console.log(chalk.dim(msg)); },
        success(msg) { if (!quiet) console.log(chalk.green(msg)); },
        warn(msg) { console.warn(chalk.yellow(msg)); },
        error(msg) { console.error(chalk.red(msg)); },
    };
}

function normalizeColumns(columns) {
    return columns.map((c) => {
        if (typeof c === 'string') return { key: c, label: c.includes('.') ? c.split('.').pop() : c };
        return { ...c, label: c.label || (c.key ? c.key.split('.').pop() : '?') };
    });
}

function csvValue(row, spec) {
    const value = rawValue(row, spec);
    if (value == null) return '';
    if (spec.format === 'date') {
        const d = value instanceof Date ? value : new Date(value);
        return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
    }
    if (spec.format === 'bytes') return String(value);
    return applyFormat(value, spec.format);
}

function rawValue(row, spec) {
    if (spec.get) return spec.get(row);
    return spec.key ? getPath(row, spec.key) : undefined;
}

function getPath(row, key) {
    if (!key.includes('.')) return row?.[key];
    let cur = row;
    for (const part of key.split('.')) {
        if (cur == null) return undefined;
        cur = cur[part];
    }
    return cur;
}

function renderCell(row, spec) {
    const value = rawValue(row, spec);
    if (value == null || value === '') return chalk.dim('-');
    let text = applyFormat(value, spec.format);
    if (spec.width && text.length > spec.width) text = `${text.slice(0, spec.width - 1)}…`;
    return spec.dim ? chalk.dim(text) : text;
}

function applyFormat(value, format) {
    switch (format) {
        case 'date': return shortDate(value);
        case 'bytes': return humanBytes(value);
        case 'list': return [].concat(value).filter(Boolean).join(', ');
        case 'bool': return value ? 'yes' : 'no';
        default:
            if (Array.isArray(value)) return value.join(', ');
            if (typeof value === 'object') return JSON.stringify(value);
            // Newlines turn one row into several and wreck the table.
            return String(value).replace(/\s*\n+\s*/g, ' ⏎ ');
    }
}

// Full ISO costs 24 characters to say "today". Same-year timestamps drop the
// year, older ones drop the clock.
function shortDate(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const pad = (n) => String(n).padStart(2, '0');
    const sameYear = d.getFullYear() === new Date().getFullYear();
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return sameYear
        ? `${day.slice(5)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
        : day;
}

function humanBytes(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    const units = ['B', 'K', 'M', 'G', 'T'];
    let i = 0;
    let size = n;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${i === 0 ? size : size.toFixed(size < 10 ? 1 : 0)}${units[i]}`;
}

function csvEscape(v) {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

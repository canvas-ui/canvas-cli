'use strict';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

import { parseGlobal } from './parser.js';
import { createIO, readStdin } from './io.js';
import { loadRegistry } from './registry.js';
import { dispatch } from './dispatcher.js';
import { CanvasClient } from './transport/rest.js';
import session from './session.js';
import { CanvasError, UsageError } from './errors.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = join(HERE, '..', '..', 'package.json');

function readVersion() {
    try { return JSON.parse(readFileSync(PKG_PATH, 'utf8')).version; }
    catch { return '0.0.0'; }
}

export async function main(argv = process.argv.slice(2)) {
    try {
        const parsed = parseGlobal(argv);
        if (parsed.debug || parsed.verbose) process.env.DEBUG = 'canvas:*';

        const io = createIO({
            format: parsed.format,
            raw: parsed.raw || parsed.json,
            quiet: parsed.quiet,
        });

        if (parsed.version) {
            io.print(`canvas-cli v${readVersion()}`);
            return 0;
        }

        const registry = await loadRegistry();

        if (!parsed._[0] || (parsed.help && !parsed._[0])) {
            showHelp(registry, io);
            return 0;
        }

        const stdin = process.stdin.isTTY ? null : await readStdin();
        const client = new CanvasClient();

        if (parsed.help && parsed._[0]) {
            return showCommandHelp(registry, parsed._[0], io);
        }

        await dispatch({
            tokens: parsed._.map(String),
            argv,
            registry,
            ctx: { client, session, io, stdin },
        });
        return 0;
    } catch (err) {
        if (err instanceof UsageError) {
            console.error(chalk.red(err.message));
            console.error(chalk.dim('Run `canvas --help` for available commands.'));
            return 2;
        }
        if (err instanceof CanvasError) {
            console.error(chalk.red(`Error: ${err.message}`));
            if (process.env.DEBUG) console.error(err.stack);
            return 1;
        }
        console.error(chalk.red(`Error: ${err.message}`));
        if (process.env.DEBUG) console.error(err.stack);
        return 1;
    }
}

function showHelp(registry, io) {
    const v = readVersion();
    io.print(chalk.bold(`canvas-cli v${v}`));
    io.print('');
    io.print(chalk.bold('Usage:'));
    io.print('  canvas <command> [action] [options]');
    io.print('');
    io.print(chalk.bold('Modules:'));
    if (registry.modules.length === 0) {
        io.print(chalk.dim('  (no modules registered)'));
    } else {
        for (const mod of registry.modules) {
            const aliases = (mod.aliases || []).join(', ');
            const desc = mod.description || '';
            const label = aliases ? `${mod.name} (${aliases})` : mod.name;
            io.print(`  ${label.padEnd(28)} ${chalk.dim(desc)}`);
        }
    }
    io.print('');
    io.print(chalk.bold('Global options:'));
    io.print('  -h, --help        Show help');
    io.print('  -v, --version     Show version');
    io.print('  -f, --format      Output format (table|json|csv)');
    io.print('  -r, --raw         Raw JSON output');
    io.print('  -d, --debug       Enable debug output');
}

function showCommandHelp(registry, name, io) {
    const mod = registry.byName.get(name);
    if (!mod) {
        io.error(`Unknown command: ${name}`);
        return 2;
    }
    io.print(chalk.bold(mod.name) + (mod.aliases?.length ? ` (${mod.aliases.join(', ')})` : ''));
    if (mod.description) io.print(mod.description);
    io.print('');
    io.print(chalk.bold('Actions:'));
    const seen = new Set();
    for (const [name, action] of mod.actions.entries()) {
        if (seen.has(action)) continue;
        seen.add(action);
        const aliases = (action.aliases || []).filter((a) => a !== name);
        const label = aliases.length ? `${action.name} (${aliases.join(', ')})` : action.name;
        io.print(`  ${label.padEnd(24)} ${chalk.dim(action.description || '')}`);
    }
    if (mod.submodules.size > 0) {
        io.print('');
        io.print(chalk.bold('Submodules:'));
        const seenSub = new Set();
        for (const sub of mod.submodules.values()) {
            if (seenSub.has(sub)) continue;
            seenSub.add(sub);
            io.print(`  ${sub.name.padEnd(24)} ${chalk.dim(sub.description || '')}`);
        }
    }
    return 0;
}

export default main;

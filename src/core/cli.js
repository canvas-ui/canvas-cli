'use strict';

import chalk from 'chalk';

import { parseGlobal } from './parser.js';
import { createIO, readStdin } from './io.js';
import { loadRegistry } from './registry.js';
import { dispatch } from './dispatcher.js';
import { CanvasClient } from './transport/rest.js';
import session from './session.js';
import { remotes as remotesStore } from './storage.js';
import { CanvasError, UsageError, AuthError } from './errors.js';
import pkg from '../../package.json' with { type: 'json' };

function readVersion() {
    return pkg.version || '0.0.0';
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
        if (err instanceof AuthError) {
            printNotConnected();
            if (process.env.DEBUG) console.error(err.stack);
            return 1;
        }
        if (err instanceof CanvasError) {
            const cause = err.cause;
            const isNetErr = cause && (
                cause.code === 'ECONNREFUSED' ||
                cause.code === 'ENOTFOUND' ||
                cause.code === 'ETIMEDOUT' ||
                cause.code === 'ECONNRESET'
            );
            if (isNetErr) {
                printConnectionFailed(err);
                if (process.env.DEBUG) console.error(err.stack);
                return 1;
            }
            console.error(chalk.red(`Error: ${err.message}`));
            if (process.env.DEBUG) console.error(err.stack);
            return 1;
        }
        console.error(chalk.red(`Error: ${err.message}`));
        if (process.env.DEBUG) console.error(err.stack);
        return 1;
    }
}

function printNotConnected() {
    const allRemotes = remotesStore.read();
    const remoteList = Object.entries(allRemotes);
    const boundId = session.boundRemote();

    console.error('');
    if (remoteList.length === 0) {
        console.error(chalk.yellow('Not connected — no remotes configured.'));
        console.error('');
        console.error('Get started by adding a remote server:');
        console.error('  ' + chalk.cyan('canvas remote add <name> <url>'));
        console.error('  ' + chalk.cyan('canvas remote bind <name>'));
    } else if (!boundId) {
        console.error(chalk.yellow('Not connected — no active remote.'));
        console.error('');
        console.error(chalk.bold('Available remotes:'));
        for (const [id, cfg] of remoteList) {
            console.error(`  ${id.padEnd(20)} ${chalk.dim(cfg.url || '')}`);
        }
        console.error('');
        console.error('Connect with: ' + chalk.cyan('canvas remote bind <name>'));
    } else {
        console.error(chalk.yellow(`Not connected to remote '${boundId}'.`));
        console.error('');
        console.error('  ' + chalk.cyan('canvas remote ping') + '    Test the connection');
        console.error('  ' + chalk.cyan('canvas remote list') + '    List all remotes');
    }
    console.error('');
}

function printConnectionFailed(err) {
    const allRemotes = remotesStore.read();
    const boundId = session.boundRemote();
    const remote = boundId ? allRemotes[boundId] : null;

    console.error('');
    if (remote) {
        console.error(chalk.yellow(`Cannot reach remote '${boundId}' (${remote.url})`));
        console.error(chalk.dim(err.message));
    } else {
        console.error(chalk.yellow(`Connection failed: ${err.message}`));
    }
    console.error('');
    console.error('Troubleshooting:');
    console.error('  ' + chalk.cyan('canvas remote ping') + '    Test the connection');
    console.error('  ' + chalk.cyan('canvas remote list') + '    List all remotes');
    const url = remote?.url || '';
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
        console.error('  ' + chalk.cyan('canvas server start') + '   Start the local server');
    }
    console.error('');
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

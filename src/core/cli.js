'use strict';

import chalk from 'chalk';

import { parseGlobal, formatUsage } from './parser.js';
import { createIO, readStdin } from './io.js';
import { loadRegistry, collectFlagVocabulary, resolvePath } from './registry.js';
import { dispatch } from './dispatcher.js';
import { CanvasClient } from './transport/rest.js';
import session from './session.js';
import { remotes as remotesStore } from './storage.js';
import { CanvasError, UsageError, AuthError } from './errors.js';
import { isNetworkError } from '@augmentd-labs/canvas-api-client';
import pkg from '../../package.json' with { type: 'json' };

function readVersion() {
    return pkg.version || '0.0.0';
}

export async function main(argv = process.argv.slice(2)) {
    try {
        // The registry is built BEFORE parsing: it owns the flag vocabulary,
        // without which the first pass mistakes an unknown flag for one that
        // takes a value and eats the positional after it.
        const registry = await loadRegistry();
        const parsed = parseGlobal(argv, collectFlagVocabulary(registry));
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

        if (!parsed._[0] || (parsed.help && !parsed._[0])) {
            showHelp(registry, io);
            return 0;
        }

        const stdin = process.stdin.isTTY ? null : await readStdin();
        const client = new CanvasClient();

        if (parsed.help && parsed._[0]) {
            return showHelpForPath(registry, parsed._.map(String), io);
        }

        const result = await dispatch({
            tokens: parsed._.map(String),
            argv,
            registry,
            ctx: { client, session, io, stdin },
        });
        if (result?.kind === 'help') {
            if (result.path?.length) return showHelpForPath(registry, result.path, io);
            showHelp(registry, io);
        }
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
            // isNetworkError covers node/undici codes AND Bun's fetch codes —
            // the compiled binary runs under Bun, where ECONNREFUSED-style
            // codes never appear.
            if (isNetworkError(err)) {
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

function showHelpForPath(registry, tokens, io) {
    const { path, mod, action } = resolvePath(registry, tokens);
    if (!mod) {
        io.error(`Unknown command: ${tokens[0]}`);
        return 2;
    }

    // Deepest level: one verb.
    if (action) {
        const aliases = (action.aliases || []).filter((a) => a !== action.name);
        io.print(chalk.bold(action.name) + (aliases.length ? ` (${aliases.join(', ')})` : ''));
        if (action.description) io.print(action.description);
        io.print('');
        io.print(chalk.bold('Usage:'));
        io.print(`  ${formatUsage(path, action)}`);
        printFlags(action, io);
        return 0;
    }

    const label = mod.name + (mod.aliases?.length ? ` (${mod.aliases.join(', ')})` : '');
    io.print(chalk.bold(label));
    if (mod.description) io.print(mod.description);
    io.print('');
    io.print(chalk.bold('Usage:'));
    const resourceSlot = mod.resourceArg ? ` [<${mod.resourceArg.name || mod.name}>]` : '';
    const prefix = `  canvas ${path.join(' ')}`;
    if (mod.submodules.size > 0) io.print(`${prefix}${resourceSlot} <noun> <verb> [args] [--flags]`);
    io.print(`${prefix}${resourceSlot} <verb> [args] [--flags]`);

    if (mod.submodules.size > 0) {
        io.print('');
        io.print(chalk.bold('Nouns:') + chalk.dim('   (plural lists: `notes` == `note list`)'));
        const seen = new Set();
        for (const sub of mod.submodules.values()) {
            if (seen.has(sub)) continue;
            seen.add(sub);
            const extra = [...(sub.aliases || []), ...(sub.pluralAlias ? [sub.pluralAlias] : [])];
            const name = extra.length ? `${sub.name} (${extra.join(', ')})` : sub.name;
            io.print(`  ${name.padEnd(26)} ${chalk.dim(sub.description || '')}`);
        }
    }

    io.print('');
    io.print(chalk.bold(mod.submodules.size > 0 ? 'Verbs:' : 'Actions:'));
    const seen = new Set();
    for (const [name, act] of mod.actions.entries()) {
        if (seen.has(act)) continue;
        seen.add(act);
        const aliases = (act.aliases || []).filter((a) => a !== name);
        const label2 = aliases.length ? `${act.name} (${aliases.join(', ')})` : act.name;
        io.print(`  ${label2.padEnd(26)} ${chalk.dim(act.description || '')}`);
    }
    io.print('');
    io.print(chalk.dim(`  canvas ${path.join(' ')} <verb> --help   for one verb's arguments`));
    return 0;
}

function printFlags(action, io) {
    const flags = Object.entries(action.flags || {});
    if (!flags.length) return;
    io.print('');
    io.print(chalk.bold('Flags:'));
    for (const [name, type] of flags) {
        io.print(`  --${name}${type === 'boolean' ? '' : ' <value>'}`);
    }
}

export default main;

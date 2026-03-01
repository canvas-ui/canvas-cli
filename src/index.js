#!/usr/bin/env node
'use strict';

import minimist from 'minimist';
import chalk from 'chalk';

import WorkspaceCommand from './commands/workspace.js';
import ContextCommand from './commands/context.js';
import AuthCommand from './commands/auth.js';
import ConfigCommand from './commands/config.js';
import RemoteCommand from './commands/remote.js';
import AliasCommand from './commands/alias.js';
import DotCommand from './commands/dot.js';
import QCommand from './commands/q.js';
import ServerCommand from './commands/server.js';

const VERSION = '2.0.0-alpha';

const COMMANDS = {
    workspace: WorkspaceCommand, ws: WorkspaceCommand, workspaces: WorkspaceCommand,
    context: ContextCommand, ctx: ContextCommand, contexts: ContextCommand,
    auth: AuthCommand,
    config: ConfigCommand,
    remote: RemoteCommand, remotes: RemoteCommand,
    alias: AliasCommand,
    q: QCommand,
    dot: DotCommand,
    server: ServerCommand,
};

const PLURAL_ALIASES = ['remotes', 'contexts', 'workspaces'];
const SINGULAR_DEFAULTS = { remote: 'current', workspace: 'current' };

export async function main(argv = process.argv.slice(2)) {
    try {
        const args = minimist(argv, {
            string: ['context', 'workspace', 'format', 'title', 'tag', 'schema',
                'connector', 'model', 'template', 'max-tokens', 'priority'],
            boolean: ['help', 'version', 'raw', 'verbose', 'debug', 'code', 'quiet',
                'show-prompt', 'show-prompt-only', 'update-dotfiles', 'encrypt', 'force'],
            alias: {
                h: 'help', v: 'version', c: 'context', w: 'workspace',
                f: 'format', t: 'title', s: 'schema', r: 'raw', d: 'debug',
                q: 'quiet', u: 'update-dotfiles', e: 'encrypt', p: 'priority',
            },
        });

        if (args.debug || args.verbose) process.env.DEBUG = 'canvas:*';
        if (args.version) { console.log(`canvas-cli v${VERSION}`); return 0; }

        const cmd = args._[0];

        if (cmd && COMMANDS[cmd] && args.help) {
            const instance = new COMMANDS[cmd]();
            if (typeof instance.showHelp === 'function') instance.showHelp();
            else showHelp();
            return 0;
        }

        if (cmd && COMMANDS[cmd]) {
            const instance = new COMMANDS[cmd]();
            const parsed = parseInput(args);

            if (PLURAL_ALIASES.includes(cmd) && parsed.args.length === 0) {
                parsed.args = ['list'];
            }
            if (SINGULAR_DEFAULTS[cmd] && parsed.args.length === 0) {
                parsed.args = [SINGULAR_DEFAULTS[cmd]];
            }

            if (!process.stdin.isTTY) {
                parsed.data = await readStdin();
            }

            return await instance.execute(parsed);
        }

        if (!cmd || args.help) { showHelp(); return 0; }

        console.error(chalk.red(`Unknown command: ${cmd}`));
        console.error(chalk.yellow('Run "canvas --help" for available commands.'));
        return 1;
    } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        if (process.env.DEBUG) console.error(error.stack);
        return 1;
    }
}

function parseInput(parsedArgs) {
    const command = parsedArgs._[0] || null;
    const args = parsedArgs._.slice(1);
    const options = { ...parsedArgs };
    delete options._;
    return { command, args, options, data: null };
}

function readStdin() {
    return new Promise((resolve) => {
        const chunks = [];
        process.stdin.on('data', (d) => chunks.push(d));
        process.stdin.on('end', () => resolve(chunks.join('')));
    });
}

function showHelp() {
    console.log(chalk.bold(`canvas-cli v${VERSION}`));
    console.log();
    console.log(chalk.bold('Usage:'));
    console.log('  canvas <command> [action] [options]');
    console.log();
    console.log(chalk.bold('Commands:'));
    console.log('  workspace, ws     Manage workspaces');
    console.log('  context, ctx      Manage contexts');
    console.log('  auth              Authentication & tokens');
    console.log('  config            CLI configuration');
    console.log('  remote            Manage remote servers');
    console.log('  alias             Resource aliases');
    console.log('  q                 AI assistant');
    console.log('  dot               Dotfile manager');
    console.log();
    console.log(chalk.bold('Global Options:'));
    console.log('  -h, --help        Show help');
    console.log('  -v, --version     Show version');
    console.log('  -f, --format      Output format (table, json, csv)');
    console.log('  -r, --raw         Raw JSON output');
    console.log('  -d, --debug       Enable debug output');
    console.log();
    console.log(chalk.bold('Quick Start:'));
    console.log('  canvas remote add admin@myserver http://localhost:8001');
    console.log('  canvas remote bind admin@myserver');
    console.log('  canvas workspaces');
    console.log('  canvas context create my-project');
    console.log('  canvas context switch my-project');
}

export default main;

if (import.meta.url === `file://${process.argv[1]}`) {
    main().then(process.exit).catch((e) => { console.error(e); process.exit(1); });
}

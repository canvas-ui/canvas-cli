#!/usr/bin/env node
'use strict';

import minimist from 'minimist';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

// Windows compatibility - initialize early
import {
    initWindowsCompat,
    needsWindowsCompat,
    getPlatformInfo,
} from './utils/windows-compat.js';

// Initialize Windows compatibility fixes before anything else
initWindowsCompat();

// Utils
import config from './utils/config.js';
import { parseInput } from './lib/common.js';
import { setupDebug } from './lib/debug.js';

// Commands
import WorkspaceCommand from './commands/workspace.js';
import ContextCommand from './commands/context.js';
import AuthCommand from './commands/auth.js';
import ConfigCommand from './commands/config.js';
import ServerCommand from './commands/server.js';
import QCommand from './commands/q.js';
import RemoteCommand from './commands/remote.js';
import AliasCommand from './commands/alias.js';
import DiagnosticCommand from './commands/diagnostic.js';
import DotCommand from './commands/dot.js';
import HiCommand from './commands/hi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Package info - embedded at build time to avoid runtime dependency on package.json
const pkg = {
    name: 'canvas-cli',
    version: '1.0.0-alpha',
    description: 'Canvas CLI',
};

const debug = setupDebug('canvas:cli');

/**
 * CLI Commands Registry
 */
const COMMANDS = {
    workspace: WorkspaceCommand,
    ws: WorkspaceCommand, // alias
    workspaces: WorkspaceCommand, // list alias
    context: ContextCommand,
    ctx: ContextCommand, // alias
    contexts: ContextCommand, // list alias
    auth: AuthCommand,
    config: ConfigCommand,
    server: ServerCommand,
    remote: RemoteCommand, // remote management
    remotes: RemoteCommand, // list alias
    alias: AliasCommand, // alias management
    q: QCommand, // AI query command
    diagnostic: DiagnosticCommand, // diagnostic tools
    diag: DiagnosticCommand, // alias
    dot: DotCommand, // dotfile manager
    agent: HiCommand, // agent placeholder
    hi: HiCommand, // alias
    help: null, // handled separately
    version: null, // handled separately
};

/**
 * Main CLI entry point
 */
export async function main(argv = process.argv.slice(2)) {
    try {
        const args = minimist(argv, {
            string: [
                'context',
                'workspace',
                'format',
                'title',
                'tag',
                'schema',
                'connector',
                'model',
                'template',
                'max-tokens',
            ],
            boolean: [
                'help',
                'version',
                'raw',
                'verbose',
                'debug',
                'code',
                'quiet',
                'show-prompt',
                'show-prompt-only',
                'update-dotfiles',
            ],
            alias: {
                h: 'help',
                v: 'version',
                c: 'context',
                w: 'workspace',
                f: 'format',
                t: 'title',
                s: 'schema',
                r: 'raw',
                d: 'debug',
                q: 'quiet',
                u: 'update-dotfiles',
            },
        });

        // Handle debug flag
        if (args.debug || args.verbose) {
            process.env.DEBUG = 'canvas:*';
            setupDebug('canvas:*'); // Re-initialize debug with the new setting
        }

        debug('CLI args:', args);

        // Handle version
        if (args.version) {
            console.log(`${pkg.name} v${pkg.version}`);

            // Show platform info for debugging if on Windows
            if (needsWindowsCompat() || args.debug) {
                const platformInfo = getPlatformInfo();
                console.log();
                console.log('Platform Information:');
                console.log(
                    `  Platform: ${platformInfo.platform} ${platformInfo.arch}`,
                );
                console.log(`  OS Release: ${platformInfo.release}`);
                console.log(`  Node Version: ${platformInfo.nodeVersion}`);
                console.log(`  Is Bundled: ${platformInfo.isBundled}`);
                console.log(`  Has Console: ${platformInfo.hasConsole}`);
                console.log(`  TTY: ${platformInfo.stdoutIsTTY}`);
                console.log(`  Force Color: ${platformInfo.forceColor}`);
                if (platformInfo.isBun) {
                    console.log(`  Bun Runtime: Yes`);
                }
            }

            return 0;
        }

        const commandNameFromArgs = args._[0];

        // Case 1: A specific command is invoked with --help
        if (commandNameFromArgs && COMMANDS[commandNameFromArgs] && args.help) {
            const CommandClass = COMMANDS[commandNameFromArgs];
            const commandInstance = new CommandClass(config);
            if (typeof commandInstance.showHelp === 'function') {
                commandInstance.showHelp();
            } else {
                // Fallback if command has no specific help
                console.log(
                    chalk.yellow(
                        `No specific help defined for command '${commandNameFromArgs}'. Showing general help.`,
                    ),
                );
                showHelp();
            }
            return 0;
        }

        // Case 2: A specific command is invoked (not for --help, that's handled above)
        // This also covers 'canvas <command> help' (where 'help' is an argument handled by the command's execute method)
        if (commandNameFromArgs && COMMANDS[commandNameFromArgs]) {
            const CommandClass = COMMANDS[commandNameFromArgs];
            const commandInstance = new CommandClass(config);

            const parsedInput = parseInput(args); // parseInput needs full args for context

            // Handle special list command aliases
            if (
                commandNameFromArgs === 'remotes' ||
        commandNameFromArgs === 'contexts' ||
        commandNameFromArgs === 'workspaces'
            ) {
                // Force list action for plural forms
                if (parsedInput.args.length === 0) {
                    parsedInput.args = ['list'];
                }
            }

            // Handle "show current" behavior for singular commands with no args
            if (commandNameFromArgs === 'remote' && parsedInput.args.length === 0) {
                parsedInput.args = ['current'];
            }

            if (
                commandNameFromArgs === 'workspace' &&
        parsedInput.args.length === 0
            ) {
                parsedInput.args = ['current'];
            }

            let stdinData = null;
            if (!process.stdin.isTTY) {
                stdinData = await readStdin();
                parsedInput.data = stdinData; // Attach stdin data to the object passed to execute
            }

            const exitCode = await commandInstance.execute(parsedInput);
            return exitCode;
        }

        // Case 3: General help (--help with no command, or no command at all)
        if (args.help || args._.length === 0) {
            showHelp();
            return 0;
        }

        // Case 4: Unknown command
        if (commandNameFromArgs && !COMMANDS[commandNameFromArgs]) {
            console.error(chalk.red(`Unknown command: ${commandNameFromArgs}`));
            console.error(
                chalk.yellow(`Run "canvas --help" for available commands.`),
            );
            return 1;
        }

        // Fallback: Should ideally be caught by args._.length === 0 if no command
        // or if a non-command argument is passed without a valid command.
        showHelp();
        return 0;
    } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        if (process.env.DEBUG) {
            console.error(error.stack);
        }
        return 1;
    }
}

/**
 * Read data from stdin
 */
async function readStdin() {
    return new Promise((resolve) => {
        const chunks = [];
        process.stdin.on('data', (data) => chunks.push(data));
        process.stdin.on('end', () => resolve(chunks.join('')));
    });
}

/**
 * Show help information
 */
function showHelp() {
    console.log(chalk.bold(`${pkg.name} v${pkg.version}`));
    console.log(chalk.gray(pkg.description));
    console.log();

    console.log(chalk.bold('Usage:'));
    console.log('  canvas <command> [options] [arguments]');
    console.log();

    console.log(chalk.bold('Commands:'));
    console.log('  workspace, ws     Manage workspaces');
    console.log('  workspaces        List all workspaces (alias)');
    console.log('  context, ctx      Manage contexts');
    console.log('  contexts          List all contexts (alias)');
    console.log('  auth              Manage authentication');
    console.log('  config            Manage configuration');
    console.log('  server            Manage local Canvas server (PM2)');
    console.log('  remote            Manage remote Canvas servers');
    console.log('  remotes           List all remotes (alias)');
    console.log('  alias             Manage resource aliases');
    console.log('  q                 AI assistant (context-aware)');
    console.log('  diagnostic, diag  Platform diagnostic tools');
    console.log('  dot               Dotfile manager');
    console.log('  agent, hi         Agent (placeholder)');
    console.log();

    console.log(chalk.bold('Global Options:'));
    console.log('  -h, --help        Show help');
    console.log('  -v, --version     Show version');
    console.log('  -c, --context     Set context');
    console.log('  -w, --workspace   Set workspace');
    console.log('  -f, --format      Output format (table, json, csv)');
    console.log('  -r, --raw         Raw JSON output');
    console.log('  -d, --debug       Enable debug output');
    console.log();

    console.log(chalk.bold('Examples:'));
    console.log('  canvas server start');
    console.log('  canvas remote add admin@canvas.local http://localhost:8001');
    console.log('  canvas remote sync admin@canvas.local');
    console.log('  canvas remote bind admin@canvas.local');
    console.log('  canvas remotes                      # List all remotes');
    console.log('  canvas remote                       # Show current remote');
    console.log('  canvas alias set prod admin@production.server:universe');
    console.log('  canvas alias list                   # List all aliases');
    console.log('  canvas workspaces                   # List all workspaces');
    console.log('  canvas workspace                    # Show current workspace');
    console.log(
        '  canvas ws                           # List workspaces (alias)',
    );
    console.log(
        '  canvas ws universe                  # Show universe workspace',
    );
    console.log('  canvas ws universe tree             # Show workspace tree');
    console.log('  canvas contexts                     # List all contexts');
    console.log('  canvas context                      # Show current context');
    console.log(
        '  canvas ctx                          # Show current context (alias)',
    );
    console.log('  canvas context create my-project');
    console.log('  canvas context switch my-project');
    console.log('  canvas context switch prod          # Using alias');
    console.log('  canvas context documents');
    console.log('  canvas context dotfiles');
    console.log('  canvas context tabs');
    console.log('  canvas context notes                # List notes');
    console.log(
        '  canvas context note add "Remember to check logs" --title "Important"',
    );
    console.log(
        '  canvas context tab add https://example.com --title "Example Site"',
    );
    console.log(
        '  canvas ws universe documents        # List workspace documents',
    );
    console.log('  canvas ws universe tabs             # List workspace tabs');
    console.log('  canvas q "How do I create a new context?"');
    console.log('  cat error.log | canvas q "What does this error mean?"');
    console.log('  canvas diagnostic platform          # Show platform info');
    console.log('  canvas diagnostic console           # Test console output');
    console.log(
        '  canvas dot init admin@mycanvas:work  # Initialize dotfiles repo',
    );
    console.log(
        '  canvas dot clone admin@mycanvas:work # Clone dotfiles locally',
    );
    console.log('  canvas dot add ~/.bashrc work/bashrc # Add dotfile to repo');
    console.log(
        '  canvas dot activate admin@mycanvas:work/bashrc # Activate specific dotfile',
    );
    console.log();

    console.log(chalk.bold('Configuration:'));
    console.log(`  Config file: ${config.path}`);
    console.log('  canvas config show');
    console.log('  canvas config set server.url http://localhost:8001/rest/v2');
}

export default main;

// Execute main function if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main()
        .then(process.exit)
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

'use strict';

import chalk from 'chalk';
import BaseCommand from './base.js';

/**
 * Hi/Agent placeholder command
 */
export class HiCommand extends BaseCommand {
    constructor(config) {
        super(config);
        this.options = null;
    }

    async execute(parsed) {
        try {
            this.options = parsed.options;

            // Collect client context for this execution
            this.collectClientContext();

            const sub = parsed.args[0] || 'help';
            if (sub === 'help') {
                this.showHelp();
                return 0;
            }

            // Placeholder behavior: greet and echo args
            console.log(chalk.green('Canvas Agent placeholder (hi)'));
            if (parsed.args.length > 0) {
                console.log(chalk.gray('Args:'), parsed.args.join(' '));
            }
            return 0;
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            if (process.env.DEBUG) {
                console.error(error.stack);
            }
            return 1;
        }
    }

    showHelp() {
        console.log(chalk.bold('Agent (hi) Commands:'));
        console.log('  agent                Placeholder agent command');
        console.log('  hi                   Same as agent');
        console.log();
        console.log('Examples:');
        console.log('  canvas agent');
        console.log('  canvas hi');
    }
}

export default HiCommand;

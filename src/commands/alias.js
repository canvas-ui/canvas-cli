'use strict';

import chalk from 'chalk';
import BaseCommand from './base.js';
import { isValidResourceAddress } from '../utils/address-parser.js';

export class AliasCommand extends BaseCommand {
    get needsConnection() { return false; }

    async handleList() {
        const aliases = await this.client.store.getAliases();
        if (Object.keys(aliases).length === 0) {
            console.log(chalk.yellow('No aliases configured'));
            console.log(chalk.cyan('Create one: canvas alias set <name> <address>'));
            return 0;
        }
        await this.output(
            Object.entries(aliases).map(([alias, cfg]) => ({
                alias,
                address: cfg.address,
                created: new Date(cfg.createdAt).toLocaleString(),
            })),
        );
        return 0;
    }

    async handleSet(parsed) {
        const name = parsed.args[1];
        const address = parsed.args[2];
        if (!name) throw new Error('Alias name is required');
        if (!address) throw new Error('Resource address is required');
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            throw new Error('Alias name: letters, numbers, underscores, hyphens only');
        }

        const reserved = ['remote', 'context', 'workspace', 'alias', 'auth', 'config', 'help'];
        if (reserved.includes(name.toLowerCase())) {
            throw new Error(`'${name}' is reserved`);
        }

        if (address.includes('@') && address.includes(':') && !isValidResourceAddress(address)) {
            throw new Error('Invalid address format. Use: user@remote:resource');
        }

        const existing = await this.client.store.getAlias(name);
        if (existing && !parsed.options.force) {
            console.log(chalk.yellow(`Alias '${name}' exists → ${existing.address}. Use --force to overwrite.`));
            return 1;
        }

        await this.client.store.setAlias(name, address);
        console.log(chalk.green(`Alias '${name}' → '${address}'`));
        return 0;
    }

    async handleGet(parsed) {
        const name = parsed.args[1];
        if (!name) throw new Error('Alias name is required');
        const alias = await this.client.store.getAlias(name);
        if (!alias) { console.log(chalk.red(`Alias '${name}' not found`)); return 1; }
        console.log(alias.address);
        return 0;
    }

    async handleUpdate(parsed) {
        const name = parsed.args[1];
        const address = parsed.args[2];
        if (!name) throw new Error('Alias name is required');
        if (!address) throw new Error('Resource address is required');

        if (address.includes('@') && address.includes(':') && !isValidResourceAddress(address)) {
            throw new Error('Invalid address format');
        }

        const existing = await this.client.store.getAlias(name);
        if (!existing) {
            console.log(chalk.red(`Alias '${name}' not found`));
            return 1;
        }

        await this.client.store.updateAlias(name, address);
        console.log(chalk.green(`Alias '${name}' updated → '${address}'`));
        return 0;
    }

    async handleRemove(parsed) {
        const name = parsed.args[1];
        if (!name) throw new Error('Alias name is required');
        if (!parsed.options.force) {
            console.log(chalk.yellow(`Will remove alias '${name}'. Use --force to confirm.`));
            return 1;
        }
        const existing = await this.client.store.getAlias(name);
        if (!existing) { console.log(chalk.red(`Alias '${name}' not found`)); return 1; }
        await this.client.store.removeAlias(name);
        console.log(chalk.green(`Alias '${name}' removed`));
        return 0;
    }

    showHelp() {
        console.log(chalk.bold('Alias Commands:'));
        console.log('  list                      List all aliases');
        console.log('  set <name> <address>      Create/overwrite alias');
        console.log('  get <name>                Resolve alias');
        console.log('  update <name> <address>   Update existing alias');
        console.log('  remove <name>             Remove alias');
        console.log();
        console.log(chalk.bold('Examples:'));
        console.log('  canvas alias set prod admin@production:universe');
        console.log('  canvas context switch prod');
    }
}

export default AliasCommand;

'use strict';

import chalk from 'chalk';
import BaseCommand from './base.js';
import { isValidResourceAddress } from '../utils/address-parser.js';

/**
 * Alias command for managing resource aliases
 */
export class AliasCommand extends BaseCommand {
    constructor(config) {
        super(config);
        this.options = null;
    }

    async execute(parsed) {
        try {
            this.options = parsed.options;

            // Collect client context for this execution
            this.collectClientContext();

            // Aliases are local-only operations, no server connection needed
            const action = parsed.args[0] || 'list';
            const methodName = `handle${action.charAt(0).toUpperCase() + action.slice(1)}`;

            if (typeof this[methodName] === 'function') {
                return await this[methodName](parsed);
            } else {
                console.error(chalk.red(`Unknown action: ${action}`));
                this.showHelp();
                return 1;
            }
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            if (process.env.DEBUG) {
                console.error(error.stack);
            }
            return 1;
        }
    }

    /**
   * List all aliases
   */
    async handleList(parsed) {
        try {
            const aliases = await this.apiClient.remoteStore.getAliases();

            if (Object.keys(aliases).length === 0) {
                console.log(chalk.yellow('No aliases configured'));
                console.log();
                console.log(chalk.cyan('Create an alias with:'));
                console.log('  canvas alias set <alias-name> <resource-address>');
                return 0;
            }

            await this.output(
                Object.entries(aliases).map(([alias, config]) => ({
                    alias,
                    address: config.address,
                    createdAt: new Date(config.createdAt).toLocaleString(),
                    updatedAt: config.updatedAt
                        ? new Date(config.updatedAt).toLocaleString()
                        : 'Never',
                })),
                'alias',
            );

            return 0;
        } catch (error) {
            throw new Error(`Failed to list aliases: ${error.message}`);
        }
    }

    /**
   * Set an alias
   */
    async handleSet(parsed) {
        const aliasName = parsed.args[1];
        const resourceAddress = parsed.args[2];

        if (!aliasName) {
            throw new Error('Alias name is required');
        }

        if (!resourceAddress) {
            throw new Error('Resource address is required');
        }

        // Validate alias name (no special characters that might conflict with addressing)
        if (!/^[a-zA-Z0-9_-]+$/.test(aliasName)) {
            throw new Error(
                'Alias name can only contain letters, numbers, underscores, and hyphens',
            );
        }

        // Check if alias name conflicts with command names
        const reservedNames = [
            'remote',
            'context',
            'workspace',
            'alias',
            'auth',
            'config',
            'help',
        ];
        if (reservedNames.includes(aliasName.toLowerCase())) {
            throw new Error(
                `'${aliasName}' is a reserved name and cannot be used as an alias`,
            );
        }

        // Validate resource address format if it looks like a full address
        if (resourceAddress.includes('@') && resourceAddress.includes(':')) {
            if (!isValidResourceAddress(resourceAddress)) {
                throw new Error(
                    'Invalid resource address format. Use: user@remote:resource[/path]',
                );
            }
        }

        try {
            // Check if alias already exists
            const existingAlias =
        await this.apiClient.remoteStore.getAlias(aliasName);
            if (existingAlias && !parsed.options.force) {
                console.log(
                    chalk.yellow(
                        `Alias '${aliasName}' already exists and points to: ${existingAlias.address}`,
                    ),
                );
                console.log(
                    chalk.yellow('Use --force to overwrite the existing alias'),
                );
                return 1;
            }

            await this.apiClient.remoteStore.setAlias(aliasName, resourceAddress);

            console.log(
                chalk.green(`✓ Alias '${aliasName}' set to '${resourceAddress}'`),
            );
            return 0;
        } catch (error) {
            throw new Error(`Failed to set alias: ${error.message}`);
        }
    }

    /**
   * Get an alias
   */
    async handleGet(parsed) {
        const aliasName = parsed.args[1];

        if (!aliasName) {
            throw new Error('Alias name is required');
        }

        try {
            const alias = await this.apiClient.remoteStore.getAlias(aliasName);
            if (!alias) {
                console.log(chalk.red(`Alias '${aliasName}' not found`));
                return 1;
            }

            console.log(alias.address);
            return 0;
        } catch (error) {
            throw new Error(`Failed to get alias: ${error.message}`);
        }
    }

    /**
   * Remove an alias
   */
    async handleRemove(parsed) {
        const aliasName = parsed.args[1];

        if (!aliasName) {
            throw new Error('Alias name is required');
        }

        if (!parsed.options.force) {
            console.log(chalk.yellow(`This will remove alias '${aliasName}'.`));
            console.log(chalk.yellow('Use --force to confirm removal.'));
            return 1;
        }

        try {
            const existingAlias =
        await this.apiClient.remoteStore.getAlias(aliasName);
            if (!existingAlias) {
                console.log(chalk.red(`Alias '${aliasName}' not found`));
                return 1;
            }

            await this.apiClient.remoteStore.removeAlias(aliasName);
            console.log(chalk.green(`✓ Alias '${aliasName}' removed`));
            return 0;
        } catch (error) {
            throw new Error(`Failed to remove alias: ${error.message}`);
        }
    }

    /**
   * Update an alias
   */
    async handleUpdate(parsed) {
        const aliasName = parsed.args[1];
        const resourceAddress = parsed.args[2];

        if (!aliasName) {
            throw new Error('Alias name is required');
        }

        if (!resourceAddress) {
            throw new Error('Resource address is required');
        }

        // Validate resource address format if it looks like a full address
        if (resourceAddress.includes('@') && resourceAddress.includes(':')) {
            if (!isValidResourceAddress(resourceAddress)) {
                throw new Error(
                    'Invalid resource address format. Use: user@remote:resource[/path]',
                );
            }
        }

        try {
            const existingAlias =
        await this.apiClient.remoteStore.getAlias(aliasName);
            if (!existingAlias) {
                console.log(chalk.red(`Alias '${aliasName}' not found`));
                console.log(
                    chalk.cyan(
                        `Use 'canvas alias set ${aliasName} ${resourceAddress}' to create it`,
                    ),
                );
                return 1;
            }

            await this.apiClient.remoteStore.updateAlias(aliasName, resourceAddress);
            console.log(
                chalk.green(`✓ Alias '${aliasName}' updated to '${resourceAddress}'`),
            );
            return 0;
        } catch (error) {
            throw new Error(`Failed to update alias: ${error.message}`);
        }
    }

    /**
   * Show help
   */
    showHelp() {
        console.log(chalk.bold('Alias Commands:'));
        console.log('  list                      List all configured aliases');
        console.log(
            '  set <alias> <address>     Set an alias to a resource address',
        );
        console.log('  get <alias>               Get the address for an alias');
        console.log('  update <alias> <address>  Update an existing alias');
        console.log('  remove <alias>            Remove an alias');
        console.log();
        console.log(chalk.bold('Options:'));
        console.log(
            '  --force                   Force action without confirmation',
        );
        console.log();
        console.log(chalk.bold('Examples:'));
        console.log('  canvas alias list');
        console.log('  canvas alias set prod admin@production.server:universe');
        console.log(
            '  canvas alias set dev-ctx john@dev.local:development-context',
        );
        console.log('  canvas alias set my-ws user@remote:my-workspace');
        console.log('  canvas alias get prod');
        console.log(
            '  canvas alias update prod admin@new-production.server:universe',
        );
        console.log('  canvas alias remove old-alias --force');
        console.log();
        console.log(chalk.bold('Alias Usage:'));
        console.log('  Once set, you can use aliases in place of full addresses:');
        console.log(
            '    canvas context bind prod        # Instead of admin@production.server:universe',
        );
        console.log(
            '    canvas workspace show my-ws     # Instead of user@remote:my-workspace',
        );
        console.log();
        console.log(chalk.bold('Notes:'));
        console.log(
            '  • Aliases are stored locally in ~/.canvas/config/aliases.json',
        );
        console.log('  • Alias names cannot conflict with command names');
        console.log('  • Use descriptive names for better organization');
        console.log(
            '  • Aliases work with any Canvas resource (remotes, contexts, workspaces)',
        );
    }
}

export default AliasCommand;

'use strict';

import chalk from 'chalk';
import { CanvasApiClient } from '../utils/api-client.js';
import { createFormatter } from '../utils/formatters.js';
import { setupDebug } from '../lib/debug.js';
import { clientContext } from '../utils/client-context.js';

const debug = setupDebug('canvas:cli:command');

/**
 * Base command class
 */
export class BaseCommand {
    constructor(config) {
        this.config = config;
        this.apiClient = new CanvasApiClient(config);
        this.debug = debug;
        this.clientContext = clientContext;
    }

    /**
   * Execute the command
   * @param {Object} parsed - Parsed command arguments
   * @returns {number} Exit code
   */
    async execute(parsed) {
        try {
            this.debug(
                'Executing command:',
                parsed.command,
                'with args:',
                parsed.args,
            );

            // Collect client context for this execution
            this.collectClientContext();

            // Check if server is reachable
            await this.checkConnection();

            // Route to appropriate action
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
   * Collect client context for this command execution
   */
    collectClientContext() {
        try {
            // Collect comprehensive context
            this.currentContext = this.clientContext.collect();

            // Generate feature array for API calls
            this.featureArray = this.clientContext.generateFeatureArray();

            // Generate LLM context for queries
            this.llmContext = this.clientContext.generateLLMContext();

            // Get API headers
            this.apiHeaders = this.clientContext.getApiHeaders();

            this.debug('Client context collected:', {
                contextKeys: Object.keys(this.currentContext),
                featureArrayLength: this.featureArray.length,
                llmContextKeys: Object.keys(this.llmContext),
            });

            // Log feature array in debug mode
            this.debug('Feature array:', this.featureArray);
        } catch (error) {
            this.debug('Failed to collect client context:', error.message);
            // Set fallback values
            this.currentContext = {};
            this.featureArray = [];
            this.llmContext = {};
            this.apiHeaders = {};
        }
    }

    /**
   * Check connection to Canvas server
   */
    async checkConnection() {
        try {
            await this.apiClient.ping();
        } catch (error) {
            if (error.message.includes('No default remote bound')) {
                throw new Error(
                    `No default remote configured. Use: canvas remote add <user@remote> <url> && canvas remote bind <user@remote>`,
                );
            }
            throw new Error(`Cannot connect to Canvas server: ${error.message}`);
        }
    }

    /**
   * Format and output data
   * @param {*} data - Data to format
   * @param {string} type - Formatter type
   * @param {string} schema - Schema type for documents
   */
    async output(data, type = 'generic', schema = null) {
        const formatter = createFormatter(type, {
            raw: this.options?.raw || false,
            format: this.options?.format || 'table',
        });

        // Get session data for formatters that need it
        let session = null;
        if (['remote', 'workspace', 'context'].includes(type)) {
            try {
                session = await this.apiClient.remoteStore.getSession();
            } catch (error) {
                this.debug('Failed to get session for formatter:', error.message);
            }
        }

        if (type === 'document' && schema) {
            console.log(formatter.format(data, session, schema));
        } else {
            console.log(formatter.format(data, session));
        }
    }

    /**
   * Show help for the command
   */
    showHelp() {
        console.log(chalk.yellow('Help not implemented for this command'));
    }

    /**
   * Get current context from session or options (supports resource addresses and aliases)
   */
    async getCurrentContext(options = {}) {
        let contextAddress;

        if (options.context) {
            contextAddress = options.context;
        } else {
            // Get from session-cli.json
            const session = await this.apiClient.remoteStore.getSession();
            if (session.boundContext) {
                contextAddress = session.boundContext;
            } else {
                // Fallback to 'default' on current remote
                const currentRemote = await this.apiClient.getCurrentRemote();
                if (currentRemote) {
                    contextAddress = `${currentRemote}:default`;
                } else {
                    throw new Error(
                        'No default remote bound. Use: canvas remote bind <user@remote>',
                    );
                }
            }
        }

        // Resolve alias if needed
        const resolvedAddress =
      await this.apiClient.remoteStore.resolveAlias(contextAddress);
        return resolvedAddress;
    }

    /**
   * Validate required arguments
   */
    validateArgs(args, required = []) {
        for (const arg of required) {
            if (!args[arg]) {
                throw new Error(`Missing required argument: ${arg}`);
            }
        }
    }

    /**
   * Confirm action with user
   */
    async confirm(message) {
    // For now, just return true. In the future, we could add interactive prompts
        return true;
    }

    /**
   * Handle common list action
   */
    async handleList(parsed) {
        throw new Error('List action not implemented');
    }

    /**
   * Handle common create action
   */
    async handleCreate(parsed) {
        throw new Error('Create action not implemented');
    }

    /**
   * Handle common show action
   */
    async handleShow(parsed) {
        throw new Error('Show action not implemented');
    }

    /**
   * Handle common update action
   */
    async handleUpdate(parsed) {
        throw new Error('Update action not implemented');
    }

    /**
   * Handle common delete action
   */
    async handleDelete(parsed) {
        throw new Error('Delete action not implemented');
    }
}

export default BaseCommand;

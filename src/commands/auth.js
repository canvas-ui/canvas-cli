'use strict';

import chalk from 'chalk';
import BaseCommand from './base.js';

/**
 * Auth command
 */
export class AuthCommand extends BaseCommand {
    constructor(config) {
        super(config);
        this.options = null;
    }

    async execute(parsed) {
        this.options = parsed.options;
        return super.execute(parsed);
    }

    /**
     * Login to Canvas server
     */
    async handleLogin(parsed) {
        const email = parsed.args[1] || parsed.options.username || parsed.options.email;
        const password = parsed.options.password;

        if (!email) {
            throw new Error('Email is required');
        }

        if (!password) {
            throw new Error('Password is required (use --password)');
        }

        try {
            const response = await this.apiClient.login({ email, password });

            // Handle ResponseObject format
            const responseData = response.payload || response.data || response;
            const { token, user } = responseData;

            // Store token in config
            this.config.set('server.auth.token', token);
            this.config.set('server.auth.type', 'jwt');

            console.log(chalk.green(`✓ Successfully logged in as ${user.name || user.email}`));
            console.log(chalk.gray(`Token stored in config: ${this.config.path}`));
            return 0;
        } catch (error) {
            throw new Error(`Login failed: ${error.message}`);
        }
    }

    /**
     * Logout from Canvas server
     */
    async handleLogout(parsed) {
        try {
            await this.apiClient.logout();

            // Clear token from config
            this.config.delete('server.auth.token');

            console.log(chalk.green('✓ Successfully logged out'));
            return 0;
        } catch (error) {
            // Even if logout fails on server, clear local token
            this.config.delete('server.auth.token');
            console.log(chalk.yellow('⚠ Logout may have failed on server, but local token cleared'));
            return 0;
        }
    }

    /**
     * Show current user profile
     */
    async handleProfile(parsed) {
        try {
            const response = await this.apiClient.getProfile();

            // Handle ResponseObject format
            const profile = response.payload || response.data || response;

            console.log(chalk.bold('Current User Profile:'));
            console.log(`Name: ${profile.name || 'N/A'}`);
            console.log(`Email: ${profile.email}`);
            console.log(`User Type: ${profile.userType || 'user'}`);
            console.log(`Status: ${profile.status || 'active'}`);
            if (profile.createdAt) {
                console.log(`Created: ${new Date(profile.createdAt).toLocaleString()}`);
            }
            if (profile.lastLoginAt) {
                console.log(`Last Login: ${new Date(profile.lastLoginAt).toLocaleString()}`);
            }

            return 0;
        } catch (error) {
            throw new Error(`Failed to get profile: ${error.message}`);
        }
    }

    /**
     * List API tokens
     */
    async handleTokens(parsed) {
        try {
            const response = await this.apiClient.getApiTokens();

            // Handle ResponseObject format
            const tokens = response.payload || response.data || response;

            await this.output(tokens, 'auth');
            return 0;
        } catch (error) {
            throw new Error(`Failed to list tokens: ${error.message}`);
        }
    }

    /**
     * Create new API token
     */
    async handleCreateToken(parsed) {
        const name = parsed.args[1] || parsed.options.name;
        if (!name) {
            throw new Error('Token name is required');
        }

        const tokenData = {
            name: name,
            description: parsed.options.description || ''
        };

        try {
            const response = await this.apiClient.createApiToken(tokenData);

            // Handle ResponseObject format
            const token = response.payload || response.data || response;

            console.log(chalk.green(`✓ API token '${token.name}' created successfully`));
            console.log(chalk.bold('Token:'), chalk.yellow(token.token));
            console.log(chalk.red('⚠ Save this token now - it will not be shown again!'));

            if (parsed.options.save) {
                this.config.set('server.auth.token', token.token);
                this.config.set('server.auth.type', 'token');
                console.log(chalk.green('✓ Token saved to config'));
            }

            return 0;
        } catch (error) {
            throw new Error(`Failed to create token: ${error.message}`);
        }
    }

    /**
     * Delete API token
     */
    async handleDeleteToken(parsed) {
        const tokenId = parsed.args[1];
        if (!tokenId) {
            throw new Error('Token ID is required');
        }

        if (!parsed.options.force) {
            console.log(chalk.yellow(`Warning: This will permanently delete token '${tokenId}'.`));
            console.log(chalk.yellow('Use --force to confirm deletion.'));
            return 1;
        }

        try {
            await this.apiClient.deleteApiToken(tokenId);
            console.log(chalk.green(`✓ Token '${tokenId}' deleted successfully`));
            return 0;
        } catch (error) {
            throw new Error(`Failed to delete token: ${error.message}`);
        }
    }

    /**
     * Set API token manually
     */
    async handleSetToken(parsed) {
        const token = parsed.args[1] || parsed.options.token;
        if (!token) {
            throw new Error('Token is required');
        }

        // Validate token format
        if (!token.startsWith('canvas-')) {
            throw new Error('Invalid token format. Canvas tokens should start with "canvas-"');
        }

        // Store token in config
        this.config.set('server.auth.token', token);
        this.config.set('server.auth.type', 'token');

        console.log(chalk.green('✓ API token set successfully'));
        console.log(chalk.gray(`Token stored in config: ${this.config.path}`));

        // Test the token
        try {
            await this.apiClient.ping();
            console.log(chalk.green('✓ Token is valid and server is reachable'));
        } catch (error) {
            console.log(chalk.yellow('⚠ Warning: Token may be invalid or server unreachable'));
        }

        return 0;
    }

    /**
     * Show current auth status
     */
    async handleStatus(parsed) {
        const token = this.config.get('server.auth.token');
        const authType = this.config.get('server.auth.type');
        const serverUrl = this.config.get('server.url');

        console.log(chalk.bold('Authentication Status:'));
        console.log(`Server URL: ${serverUrl}`);
        console.log(`Auth Type: ${authType || 'none'}`);
        console.log(`Token: ${token ? token.substring(0, 10) + '...' : 'none'}`);

        if (token) {
            try {
                await this.apiClient.ping();
                console.log(`Status: ${chalk.green('✓ Connected')}`);

                // Try to get profile if using JWT
                if (authType === 'jwt') {
                    try {
                        const response = await this.apiClient.getProfile();
                        const profile = response.payload || response.data || response;
                        console.log(`User: ${profile.name || profile.email} (${profile.email})`);
                    } catch (error) {
                        console.log(`User: ${chalk.yellow('Unable to fetch profile')}`);
                    }
                }
            } catch (error) {
                console.log(`Status: ${chalk.red('✗ Connection failed')}`);
                console.log(`Error: ${error.message}`);
            }
        } else {
            console.log(`Status: ${chalk.yellow('○ Not authenticated')}`);
        }

        return 0;
    }

    /**
     * Override checkConnection to skip for auth commands that don't need it
     */
    async checkConnection() {
        const action = this.options?.action || 'status';
        if (['set-token', 'status'].includes(action)) {
            return; // Skip connection check for these actions
        }
        return super.checkConnection();
    }

    /**
     * Show help
     */
    showHelp() {
        console.log(chalk.bold('Auth Commands:'));
        console.log('  login <email>         Login with email/password');
        console.log('  logout                Logout and clear token');
        console.log('  profile               Show current user profile');
        console.log('  status                Show authentication status');
        console.log('  tokens                List API tokens');
        console.log('  create-token <name>   Create new API token');
        console.log('  delete-token <id>     Delete API token');
        console.log('  set-token <token>     Set API token manually');
        console.log();
        console.log(chalk.bold('Options:'));
        console.log('  --email <email>       Email for login');
        console.log('  --username <email>    Email for login (alias)');
        console.log('  --password <pass>     Password for login');
        console.log('  --name <name>         Token name');
        console.log('  --description <desc>  Token description');
        console.log('  --save                Save new token to config');
        console.log('  --force               Force deletion without confirmation');
        console.log();
        console.log(chalk.bold('Examples:'));
        console.log('  canvas auth login admin@canvas.local --password mypassword');
        console.log('  canvas auth create-token "CLI Access" --save');
        console.log('  canvas auth set-token canvas-abc123...');
        console.log('  canvas auth status');
        console.log('  canvas auth tokens');
    }
}

export default AuthCommand;

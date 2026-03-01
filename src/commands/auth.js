'use strict';

import chalk from 'chalk';
import BaseCommand from './base.js';

export class AuthCommand extends BaseCommand {
    get needsConnection() { return true; }
    get skipConnectionFor() { return ['set-token', 'status']; }
    get defaultAction() { return 'status'; }

    async handleLogin(parsed) {
        const email = parsed.args[1] || parsed.options.username || parsed.options.email;
        const password = parsed.options.password;
        if (!email) throw new Error('Email is required');
        if (!password) throw new Error('Password is required (use --password)');

        const { token, user } = await (await this.client.api()).post('/auth/login', {
            email, password, strategy: 'auto',
        });

        this.config.set('server.auth.token', token);
        this.config.set('server.auth.type', 'jwt');
        console.log(chalk.green(`Logged in as ${user.name || user.email}`));
        return 0;
    }

    async handleLogout() {
        try { await (await this.client.api()).post('/auth/logout'); }
        catch { /* server logout is best-effort */ }
        this.config.delete('server.auth.token');
        console.log(chalk.green('Logged out'));
        return 0;
    }

    async handleProfile() {
        const profile = await (await this.client.api()).get('/auth/me');
        console.log(chalk.bold('User Profile:'));
        console.log(`  Name:   ${profile.name || 'N/A'}`);
        console.log(`  Email:  ${profile.email}`);
        console.log(`  Type:   ${profile.userType || 'user'}`);
        console.log(`  Status: ${profile.status || 'active'}`);
        if (profile.createdAt) console.log(`  Created: ${new Date(profile.createdAt).toLocaleString()}`);
        return 0;
    }

    async handleTokens() {
        const tokens = await (await this.client.api()).get('/auth/tokens');
        await this.output(tokens, 'auth');
        return 0;
    }

    async handleCreateToken(parsed) {
        const name = parsed.args[1] || parsed.options.name;
        if (!name) throw new Error('Token name is required');

        const token = await (await this.client.api()).post('/auth/tokens', {
            name, description: parsed.options.description || '',
        });

        console.log(chalk.green(`API token '${token.name}' created`));
        console.log(chalk.bold('Token:'), chalk.yellow(token.token));
        console.log(chalk.red('Save this token now - it will not be shown again!'));

        if (parsed.options.save) {
            this.config.set('server.auth.token', token.token);
            this.config.set('server.auth.type', 'token');
            console.log(chalk.green('Token saved to config'));
        }
        return 0;
    }

    async handleDeleteToken(parsed) {
        const tokenId = parsed.args[1];
        if (!tokenId) throw new Error('Token ID is required');
        if (!parsed.options.force) {
            console.log(chalk.yellow(`Will delete token '${tokenId}'. Use --force to confirm.`));
            return 1;
        }
        await (await this.client.api()).del(`/auth/tokens/${tokenId}`);
        console.log(chalk.green(`Token '${tokenId}' deleted`));
        return 0;
    }

    async handleSetToken(parsed) {
        const token = parsed.args[1] || parsed.options.token;
        if (!token) throw new Error('Token is required');
        if (!token.startsWith('canvas-')) throw new Error('Canvas tokens start with "canvas-"');

        this.config.set('server.auth.token', token);
        this.config.set('server.auth.type', 'token');
        console.log(chalk.green('API token set'));

        try {
            await this.client.ping();
            console.log(chalk.green('Token valid, server reachable'));
        } catch {
            console.log(chalk.yellow('Token may be invalid or server unreachable'));
        }
        return 0;
    }

    async handleStatus() {
        const token = this.config.get('server.auth.token');
        const authType = this.config.get('server.auth.type');

        console.log(chalk.bold('Auth Status:'));
        console.log(`  Type:  ${authType || 'none'}`);
        console.log(`  Token: ${token ? token.substring(0, 10) + '...' : 'none'}`);

        if (token) {
            try {
                await this.client.ping();
                console.log(`  Status: ${chalk.green('Connected')}`);
                if (authType === 'jwt') {
                    try {
                        const profile = await (await this.client.api()).get('/auth/me');
                        console.log(`  User: ${profile.name || profile.email}`);
                    } catch { /* ignore */ }
                }
            } catch (e) {
                console.log(`  Status: ${chalk.red('Connection failed')}`);
                console.log(`  Error: ${e.message}`);
            }
        } else {
            console.log(`  Status: ${chalk.yellow('Not authenticated')}`);
        }
        return 0;
    }

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
        console.log('  --password <pass>     Password for login');
        console.log('  --save                Save new token to config');
        console.log('  --force               Force deletion');
    }
}

export default AuthCommand;

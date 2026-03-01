'use strict';

import chalk from 'chalk';
import { createInterface } from 'readline';
import BaseCommand from './base.js';
import { parseRemoteIdentifier } from '../utils/address-parser.js';

export class RemoteCommand extends BaseCommand {
    get needsConnection() { return false; }

    // ── Add ──

    async handleAdd(parsed) {
        const remoteId = parsed.args[1];
        const url = parsed.args[2];
        if (!remoteId) throw new Error('Remote identifier required (user@remote)');
        if (!url) throw new Error('Remote URL required');
        if (!parseRemoteIdentifier(remoteId)) throw new Error('Invalid format. Use: user@remote-name');
        try { new URL(url); } catch { throw new Error(`Invalid URL: ${url}`); }

        const existing = await this.client.store.getRemote(remoteId);
        if (existing) throw new Error(`Remote '${remoteId}' exists. Remove it first.`);

        const allRemotes = await this.client.store.getRemotes();
        const isFirst = Object.keys(allRemotes).length === 0;

        let token = parsed.options.token;
        if (token === '' || token === true) {
            token = await this._promptPassword('API token: ');
            if (!token) throw new Error('Token required');
        }

        const cfg = {
            url,
            apiBase: parsed.options.apiBase || '/rest/v2',
            version: null,
            auth: { method: token ? 'token' : 'password', tokenType: 'jwt', token: token || '' },
        };

        // Test connection
        try {
            console.log(chalk.blue(`Testing connection to '${remoteId}'...`));
            const axios = (await import('axios')).default;
            const resp = await axios.get(`${url}${cfg.apiBase}/ping`, {
                timeout: 10000,
                headers: {
                    Accept: 'application/json', 'User-Agent': 'canvas-cli/1.0.0',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });
            const info = resp.data?.payload || resp.data;
            if (info?.version) {
                cfg.version = info.version;
                console.log(chalk.green(`Connected - v${info.version}`));
            } else {
                console.log(chalk.green('Connected'));
            }
        } catch (e) {
            console.log(chalk.yellow(`Connection test failed: ${e.message}`));
        }

        await this.client.store.addRemote(remoteId, cfg);
        console.log(chalk.green(`Remote '${remoteId}' added`));

        // Login if token provided
        if (token) {
            console.log(chalk.blue('Authenticating with token...'));
            await this.client.store.updateRemote(remoteId, {
                auth: { method: 'token', tokenType: 'jwt', token },
            });
        } else {
            try {
                const shouldLogin = await this._promptYesNo('Login now?', true);
                if (shouldLogin) await this._performLogin(remoteId);
            } catch { /* skip interactive login */ }
        }

        // Auto-bind first remote
        if (isFirst) {
            await this.client.store.updateSession({
                boundRemote: remoteId, boundAt: new Date().toISOString(),
            });
            console.log(chalk.green('Set as default remote (first remote)'));
        }

        // Sync
        try {
            console.log(chalk.blue(`Syncing...`));
            this.client.clearCache();
            await this.client.sync(remoteId, { silent: false });
            console.log(chalk.green('Sync complete'));
        } catch (e) {
            console.log(chalk.yellow(`Sync failed: ${e.message}`));
        }

        return 0;
    }

    // ── List ──

    async handleList() {
        const remotes = await this.client.store.getRemotes();
        const session = await this.client.store.getSession();

        if (Object.keys(remotes).length === 0) {
            console.log(chalk.yellow('No remotes configured'));
            console.log(chalk.cyan('Add: canvas remote add user@name https://url'));
            return 0;
        }

        await this.output(
            Object.entries(remotes).map(([id, cfg]) => ({
                id, url: cfg.url, version: cfg.version || 'Unknown',
                auth: cfg.auth?.method || 'unknown',
                lastSynced: cfg.lastSynced ? new Date(cfg.lastSynced).toLocaleString() : 'Never',
                status: this._remoteStatus(cfg),
            })),
            'remote',
        );

        if (session.boundRemote) {
            console.log();
            console.log(chalk.cyan(`Default: ${session.boundRemote}`));
        }
        return 0;
    }

    // ── Remove ──

    async handleRemove(parsed) {
        const remoteId = parsed.args[1];
        if (!remoteId) throw new Error('Remote identifier required');
        if (!parsed.options.force) {
            console.log(chalk.yellow(`Will remove '${remoteId}'. Use --force to confirm.`));
            return 1;
        }

        const remote = await this.client.store.getRemote(remoteId);
        if (!remote) throw new Error(`Remote '${remoteId}' not found`);

        await this.client.store.removeRemote(remoteId);
        const session = await this.client.store.getSession();
        if (session.boundRemote === remoteId) {
            await this.client.store.updateSession({
                boundRemote: null, defaultWorkspace: null,
                boundContext: null, boundAt: null,
            });
        }
        console.log(chalk.green(`Remote '${remoteId}' removed`));
        return 0;
    }

    // ── Sync ──

    async handleSync(parsed) {
        const remoteId = parsed.args[1];
        if (!remoteId) return this._syncAll();

        const remote = await this.client.store.getRemote(remoteId);
        if (!remote) throw new Error(`Remote '${remoteId}' not found`);

        console.log(chalk.blue(`Syncing '${remoteId}'...`));
        this.client.clearCache();
        const info = await this.client.sync(remoteId, { silent: false });
        if (info?.version) console.log(chalk.gray(`  Server v${info.version}`));
        console.log(chalk.green(`Sync complete for '${remoteId}'`));
        return 0;
    }

    async _syncAll() {
        const remotes = await this.client.store.getRemotes();
        if (Object.keys(remotes).length === 0) {
            console.log(chalk.yellow('No remotes configured'));
            return 0;
        }

        let ok = 0, fail = 0;
        for (const remoteId of Object.keys(remotes)) {
            try {
                console.log(chalk.blue(`Syncing '${remoteId}'...`));
                this.client.clearCache();
                await this.client.sync(remoteId, { silent: false });
                console.log(chalk.green(`  Done`));
                ok++;
            } catch (e) {
                console.log(chalk.red(`  Failed: ${e.message}`));
                fail++;
            }
        }
        console.log(`\nSynced: ${ok}, Failed: ${fail}`);
        return fail > 0 && ok === 0 ? 1 : 0;
    }

    // ── Ping ──

    async handlePing(parsed) {
        const remoteId = parsed.args[1];
        if (!remoteId) throw new Error('Remote identifier required');
        const remote = await this.client.store.getRemote(remoteId);
        if (!remote) throw new Error(`Remote '${remoteId}' not found`);

        console.log(chalk.blue(`Pinging '${remoteId}'...`));
        const start = Date.now();
        this.client.clearCache();
        const info = await this.client.ping(remoteId);
        console.log(chalk.green(`Reachable (${Date.now() - start}ms)`));
        if (info?.version) console.log(`  Version: ${info.version}`);
        if (info?.hostname) console.log(`  Host: ${info.hostname}`);
        return 0;
    }

    // ── Bind ──

    async handleBind(parsed) {
        const remoteId = parsed.args[1];
        if (!remoteId) throw new Error('Remote identifier required');
        const remote = await this.client.store.getRemote(remoteId);
        if (!remote) throw new Error(`Remote '${remoteId}' not found`);

        await this.client.store.updateSession({
            boundRemote: remoteId, boundAt: new Date().toISOString(),
        });
        console.log(chalk.green(`Bound to '${remoteId}' (${remote.url})`));

        try {
            console.log(chalk.blue('Syncing...'));
            this.client.clearCache();
            await this.client.sync(remoteId, { silent: false });
            console.log(chalk.green('Sync complete'));
            await this.client.store.updateSession({ boundRemoteStatus: 'connected' });
        } catch (e) {
            console.log(chalk.yellow(`Sync failed: ${e.message}`));
            await this.client.store.updateSession({ boundRemoteStatus: 'disconnected' });
        }
        return 0;
    }

    // ── Login / Logout ──

    async handleLogin(parsed) {
        const remoteId = parsed.args[1];
        if (!remoteId) throw new Error('Remote identifier required');
        return this._performLogin(remoteId, parsed.options);
    }

    async handleLogout(parsed) {
        const remoteId = parsed.args[1];
        if (!remoteId) throw new Error('Remote identifier required');
        const remote = await this.client.store.getRemote(remoteId);
        if (!remote) throw new Error(`Remote '${remoteId}' not found`);

        try {
            this.client.clearCache();
            const api = await this.client.api(remoteId);
            await api.post('/auth/logout');
        } catch { /* best-effort */ }

        await this.client.store.updateRemote(remoteId, {
            auth: { method: 'password', tokenType: 'jwt', token: '' },
        });
        console.log(chalk.green(`Logged out from '${remoteId}'`));
        return 0;
    }

    // ── Rename ──

    async handleRename(parsed) {
        const oldId = parsed.args[1], newId = parsed.args[2];
        if (!oldId || !newId) throw new Error('Both old and new identifiers required');
        if (!parseRemoteIdentifier(newId)) throw new Error('Invalid new identifier format');

        const old = await this.client.store.getRemote(oldId);
        if (!old) throw new Error(`Remote '${oldId}' not found`);
        if (await this.client.store.getRemote(newId)) throw new Error(`Remote '${newId}' already exists`);

        await this.client.store.addRemote(newId, old);
        await this.client.store.removeRemote(oldId);

        const session = await this.client.store.getSession();
        if (session.boundRemote === oldId) {
            await this.client.store.updateSession({ boundRemote: newId });
        }
        console.log(chalk.green(`Renamed '${oldId}' → '${newId}'`));
        return 0;
    }

    // ── Show / Current ──

    async handleShow(parsed) {
        const remoteId = parsed.args[1];
        if (!remoteId) throw new Error('Remote identifier required');
        const remote = await this.client.store.getRemote(remoteId);
        if (!remote) throw new Error(`Remote '${remoteId}' not found`);
        const session = await this.client.store.getSession();

        console.log(chalk.bold(`Remote: ${remoteId}`));
        console.log(`  URL:        ${remote.url}`);
        console.log(`  API Base:   ${remote.apiBase}`);
        console.log(`  Version:    ${remote.version || 'Unknown'}`);
        console.log(`  Auth:       ${remote.auth?.method || 'unknown'}`);
        console.log(`  Has Token:  ${remote.auth?.token ? 'Yes' : 'No'}`);
        console.log(`  Synced:     ${remote.lastSynced ? new Date(remote.lastSynced).toLocaleString() : 'Never'}`);
        console.log(`  Default:    ${session.boundRemote === remoteId ? 'Yes' : 'No'}`);
        return 0;
    }

    async handleCurrent() {
        const session = await this.client.store.getSession();
        if (!session.boundRemote) {
            console.log(chalk.yellow('No remote bound'));
            console.log(chalk.cyan('Bind: canvas remote bind <user@remote>'));
            return 1;
        }
        const remote = await this.client.store.getRemote(session.boundRemote);
        if (!remote) { console.log(chalk.red(`Remote '${session.boundRemote}' not found`)); return 1; }

        console.log(chalk.cyan('Current:'), session.boundRemote);
        console.log(`  URL: ${remote.url}`);
        console.log(`  Version: ${remote.version || 'Unknown'}`);
        console.log(`  Synced: ${remote.lastSynced ? new Date(remote.lastSynced).toLocaleString() : 'Never'}`);
        return 0;
    }

    // ── Helpers ──

    async _performLogin(remoteId, options = {}) {
        const remote = await this.client.store.getRemote(remoteId);
        if (!remote) throw new Error(`Remote '${remoteId}' not found`);

        if (options.token) {
            await this.client.store.updateRemote(remoteId, {
                auth: { method: 'token', tokenType: 'jwt', token: options.token },
            });
            console.log(chalk.green(`Logged into '${remoteId}' with token`));
            return 0;
        }

        let email = options.email || options.username;
        if (!email) email = await this._promptInput('Email: ');
        if (!email) throw new Error('Email required');

        let password = options.password;
        if (!password) password = await this._promptPassword('Password: ');
        if (!password) throw new Error('Password required');

        console.log(chalk.blue(`Logging into '${remoteId}'...`));
        this.client.clearCache();
        const api = await this.client.api(remoteId);
        const { token, user } = await api.post('/auth/login', { email, password, strategy: 'auto' });

        await this.client.store.updateRemote(remoteId, {
            auth: { method: 'token', tokenType: 'jwt', token },
        });
        console.log(chalk.green(`Logged in as ${user?.name || user?.email || email}`));
        return 0;
    }

    _remoteStatus(cfg) {
        if (!cfg.auth?.token) return chalk.yellow('No Token');
        if (!cfg.lastSynced) return chalk.gray('Unknown');
        const hours = (Date.now() - new Date(cfg.lastSynced).getTime()) / 3600000;
        if (hours < 1) return chalk.green('Synced');
        if (hours < 24) return chalk.yellow('Stale');
        return chalk.red('Old');
    }

    async _promptInput(prompt) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        return new Promise((resolve) => rl.question(prompt, (a) => { rl.close(); resolve(a); }));
    }

    async _promptPassword(prompt) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl._writeToOutput = function (s) {
            rl.output.write('\x1B[2K\x1B[200D' + prompt + '*'.repeat(rl.line.length));
        };
        return new Promise((resolve) => rl.question(prompt, (a) => { rl.output.write('\n'); rl.close(); resolve(a); }));
    }

    async _promptYesNo(prompt, defaultVal = false) {
        const answer = await this._promptInput(`${prompt} (${defaultVal ? 'Y/n' : 'y/N'}): `);
        const t = answer.toLowerCase().trim();
        if (t === '') return defaultVal;
        return t === 'y' || t === 'yes';
    }

    showHelp() {
        console.log(chalk.bold('Remote Commands:'));
        console.log('  add <user@remote> <url>    Add remote');
        console.log('  list                       List remotes');
        console.log('  remove <user@remote>       Remove remote');
        console.log('  sync [user@remote]         Sync (or all)');
        console.log('  ping <user@remote>         Test connectivity');
        console.log('  bind <user@remote>         Set as default');
        console.log('  login <user@remote>        Login');
        console.log('  logout <user@remote>       Logout');
        console.log('  rename <old> <new>         Rename');
        console.log('  show <user@remote>         Show details');
        console.log('  current                    Show current');
        console.log();
        console.log(chalk.bold('Options:'));
        console.log('  --token <token>    API token');
        console.log('  --email <email>    Login email');
        console.log('  --force            Force action');
    }
}

export default RemoteCommand;

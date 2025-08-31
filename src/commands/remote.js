'use strict';

import chalk from 'chalk';
import { createInterface } from 'readline';
import BaseCommand from './base.js';
import { remoteStore } from '../utils/config.js';
import {
    parseRemoteIdentifier,
    isLocalRemote,
} from '../utils/address-parser.js';

/**
 * Remote command for managing Canvas remote servers
 */
export class RemoteCommand extends BaseCommand {
    constructor(config) {
        super(config);
        this.options = null;
        this.remoteStore = remoteStore;
    }

    async execute(parsed) {
        this.options = parsed.options;

        // Collect client context for this execution
        this.collectClientContext();

        // Most remote operations don't need server connection check
        // as they work with local configuration

        const action = parsed.args[0] || 'list';
        const methodName = `handle${action.charAt(0).toUpperCase() + action.slice(1)}`;

        if (typeof this[methodName] === 'function') {
            return await this[methodName](parsed);
        } else {
            console.error(chalk.red(`Unknown remote action: ${action}`));
            this.showHelp();
            return 1;
        }
    }

    /**
   * Add a new remote
   */
    async handleAdd(parsed) {
        const remoteId = parsed.args[1];
        const url = parsed.args[2];

        if (!remoteId) {
            throw new Error(
                'Remote identifier is required (format: user@remote-name)',
            );
        }

        if (!url) {
            throw new Error('Remote URL is required');
        }

        // Parse and validate remote identifier
        const parsedRemote = parseRemoteIdentifier(remoteId);
        if (!parsedRemote) {
            throw new Error(
                'Invalid remote identifier format. Use: user@remote-name',
            );
        }

        // Validate URL format
        try {
            new URL(url);
        } catch (error) {
            throw new Error(`Invalid URL format: ${url}`);
        }

        try {
            // Check if remote already exists
            const existingRemote = await this.remoteStore.getRemote(remoteId);
            if (existingRemote) {
                throw new Error(
                    `Remote '${remoteId}' already exists. Use 'canvas remote remove ${remoteId}' first.`,
                );
            }

            // Check if this is the first remote BEFORE adding
            const existingRemotes = await this.remoteStore.getRemotes();
            const isFirstRemote = Object.keys(existingRemotes).length === 0;

            // Create remote configuration - initially without version
            let token = parsed.options.token;

            // If --token flag is provided but empty, prompt for token interactively
            if (parsed.options.token === '' || (parsed.options.token === true)) {
                try {
                    token = await this.promptForPassword('Enter API token: ');
                } catch (error) {
                    throw new Error(
                        'Token is required for authentication. Use --token with a value or provide when prompted.',
                    );
                }
                if (!token) {
                    throw new Error(
                        'Token is required. Please provide a valid API token.',
                    );
                }
            }

            const remoteConfig = {
                url: url,
                apiBase: parsed.options.apiBase || '/rest/v2',
                version: null, // Will be fetched from server
                auth: {
                    method: token ? 'token' : 'password',
                    tokenType: 'jwt',
                    token: token || '',
                },
            };

            // Try to fetch server version
            try {
                // Create temporary config for testing connection
                const tempConfig = {
                    get: (key) => {
                        if (key === 'server.url') {
                            return url + remoteConfig.apiBase;
                        }
                        if (key === 'server.auth.token') {
                            return remoteConfig.auth.token;
                        }
                        return null;
                    },
                };

                // Use axios directly for a simple ping test
                const axios = (await import('axios')).default;
                const testClient = axios.create({
                    baseURL: url + remoteConfig.apiBase,
                    timeout: 10000,
                    headers: {
                        Accept: 'application/json',
                        'User-Agent': 'canvas-cli/1.0.0',
                    },
                });

                if (remoteConfig.auth.token) {
                    testClient.defaults.headers.Authorization = `Bearer ${remoteConfig.auth.token}`;
                }

                console.log(
                    chalk.blue(`Testing connection to remote '${remoteId}'...`),
                );
                const pingResponse = await testClient.get('/ping');
                const serverInfo = pingResponse.data;

                // Handle ResponseObject format
                const responseData =
          serverInfo.payload || serverInfo.data || serverInfo;

                if (responseData.version) {
                    remoteConfig.version = responseData.version;
                    console.log(
                        chalk.green(
                            `✓ Connection successful - Server version: ${responseData.version}`,
                        ),
                    );
                } else {
                    console.log(
                        chalk.yellow(
                            '⚠ Connection successful but no version information available',
                        ),
                    );
                }
            } catch (error) {
                console.log(
                    chalk.yellow(`⚠ Could not fetch server version: ${error.message}`),
                );
                console.log(
                    chalk.yellow('  Remote will be added but may not be functional yet'),
                );
            }

            // Add remote to store
            await this.remoteStore.addRemote(remoteId, remoteConfig);

            console.log(chalk.green(`✓ Remote '${remoteId}' added successfully`));
            console.log(`  URL: ${url}`);
            console.log(`  API Base: ${remoteConfig.apiBase}`);
            if (remoteConfig.version) {
                console.log(`  Server Version: ${remoteConfig.version}`);
            }

            if (token) {
                console.log(chalk.yellow('  Authentication: Token-based'));
            } else {
                console.log(
                    chalk.yellow('  Authentication: Password-based (use login command)'),
                );
            }

            // Always try to login after adding a remote
            console.log();
            if (token) {
                // Token-based authentication - login automatically
                console.log(chalk.blue('Logging in with provided token...'));
                try {
                    await this.performLogin(remoteId, { token: token });
                } catch (loginError) {
                    console.log(chalk.yellow(`⚠ Login failed: ${loginError.message}`));
                    console.log(
                        chalk.yellow(
                            '  Remote added but authentication failed. You can login later with:',
                        ),
                    );
                    console.log(`  canvas remote login ${remoteId} --token your-token`);
                }
            } else {
                // Prompt for login credentials
                console.log(
                    chalk.cyan('Attempting to authenticate with the remote server...'),
                );
                try {
                    const shouldLogin = await this.promptYesNo('Login now?', true);
                    if (shouldLogin) {
                        await this.performLogin(remoteId);
                    }
                } catch (_error) {
                    console.log(
                        chalk.yellow('Skipping login. You can login later with:'),
                    );
                    console.log(
                        `  canvas remote login ${remoteId} --email your@email.com`,
                    );
                }
            }

            // If this was the first remote, auto-bind
            if (isFirstRemote) {
                // Automatically bind as default remote
                await this.remoteStore.updateSession({
                    boundRemote: remoteId,
                    boundAt: new Date().toISOString(),
                });
                console.log(
                    chalk.green(`✓ Set as default remote (first remote added)`),
                );
            } else {
                console.log();
                console.log(
                    chalk.cyan(
                        `Tip: Set as default remote with: canvas remote bind ${remoteId}`,
                    ),
                );
            }

            // Automatically sync all information after successful setup
            console.log();
            console.log(
                chalk.blue(
                    `Syncing workspaces and contexts from remote '${remoteId}'...`,
                ),
            );
            try {
                // Create API client for this remote
                const apiClient = await this.createRemoteApiClient(remoteId);

                // Test connection
                await apiClient.ping();
                console.log(chalk.green('  ✓ Connection verified'));

                // Sync workspaces
                console.log('  📦 Syncing workspaces...');
                const workspacesResponse = await apiClient.getWorkspaces();
                const workspaces =
          workspacesResponse.payload ||
          workspacesResponse.data ||
          workspacesResponse;

                if (Array.isArray(workspaces)) {
                    for (const workspace of workspaces) {
                        const workspaceKey = `${remoteId}:${workspace.id || workspace.name}`;
                        await this.remoteStore.updateWorkspace(workspaceKey, workspace);
                    }
                    console.log(
                        chalk.green(`    ✓ Synced ${workspaces.length} workspaces`),
                    );
                }

                // Sync contexts
                console.log('  📋 Syncing contexts...');
                const contextsResponse = await apiClient.getContexts();
                const contexts =
          contextsResponse.payload || contextsResponse.data || contextsResponse;

                if (Array.isArray(contexts)) {
                    for (const context of contexts) {
                        const contextKey = `${remoteId}:${context.id}`;
                        await this.remoteStore.updateContext(contextKey, context);
                    }
                    console.log(chalk.green(`    ✓ Synced ${contexts.length} contexts`));
                }

                // Update last synced timestamp
                await this.remoteStore.updateRemote(remoteId, {
                    lastSynced: new Date().toISOString(),
                });

                console.log(chalk.green(`✓ Sync completed for remote '${remoteId}'`));
            } catch (syncError) {
                console.log(chalk.yellow(`⚠ Sync failed: ${syncError.message}`));
                console.log(
                    chalk.yellow(
                        '  Remote added successfully but sync failed. You can manually sync later with:',
                    ),
                );
                console.log(`  canvas remote sync ${remoteId}`);
            }

            return 0;
        } catch (error) {
            throw new Error(`Failed to add remote: ${error.message}`);
        }
    }

    /**
   * List all remotes
   */
    async handleList(parsed) {
        try {
            const remotes = await this.remoteStore.getRemotes();
            const session = await this.remoteStore.getSession();

            if (Object.keys(remotes).length === 0) {
                console.log(chalk.yellow('No remotes configured'));
                console.log();
                console.log(chalk.cyan('Add a remote with:'));
                console.log('  canvas remote add user@remote-name https://server-url');
                return 0;
            }

            // Update session with current workspace information if we have a bound context
            try {
                if (session.boundContext) {
                    // Get the workspace from the bound context
                    const apiClient = await this.createRemoteApiClient(
                        session.boundRemote,
                    );
                    const contextResponse = await apiClient.getContext(
                        session.boundContext,
                    );
                    const context =
            contextResponse.payload || contextResponse.data || contextResponse;

                    if (context && context.url) {
                        const workspaceName = context.url.split('://')[0] || 'universe';
                        await this.remoteStore.updateSession({
                            defaultWorkspace: workspaceName,
                        });
                    }
                }
            } catch (error) {
                // Ignore errors when updating session - this is not critical
                this.debug(
                    'Failed to update session with workspace info:',
                    error.message,
                );
            }

            await this.output(
                Object.entries(remotes).map(([id, config]) => ({
                    id,
                    url: config.url,
                    version: config.version || 'Unknown',
                    auth: config.auth?.method || 'unknown',
                    lastSynced: config.lastSynced
                        ? new Date(config.lastSynced).toLocaleString()
                        : 'Never',
                    status: this.getRemoteStatus(config),
                })),
                'remote',
            );

            if (session.boundRemote) {
                console.log();
                console.log(
                    chalk.cyan(`Current default remote: ${session.boundRemote}`),
                );
            }

            return 0;
        } catch (error) {
            throw new Error(`Failed to list remotes: ${error.message}`);
        }
    }

    /**
   * Remove a remote
   */
    async handleRemove(parsed) {
        const remoteId = parsed.args[1];

        if (!remoteId) {
            throw new Error('Remote identifier is required');
        }

        if (!parsed.options.force) {
            console.log(
                chalk.yellow(
                    `Warning: This will remove remote '${remoteId}' and all its cached data.`,
                ),
            );
            console.log(chalk.yellow('Use --force to confirm removal.'));
            return 1;
        }

        try {
            const remote = await this.remoteStore.getRemote(remoteId);
            if (!remote) {
                throw new Error(`Remote '${remoteId}' not found`);
            }

            await this.remoteStore.removeRemote(remoteId);

            // Update session if this was the bound remote
            const session = await this.remoteStore.getSession();
            if (session.boundRemote === remoteId) {
                await this.remoteStore.updateSession({
                    boundRemote: null,
                    defaultWorkspace: null,
                    boundContext: null,
                    boundAt: null,
                });
                console.log(chalk.yellow('  Unbound default remote'));
            }

            console.log(chalk.green(`✓ Remote '${remoteId}' removed successfully`));
            return 0;
        } catch (error) {
            throw new Error(`Failed to remove remote: ${error.message}`);
        }
    }

    /**
   * Sync with a remote (fetch workspaces and contexts)
   */
    async handleSync(parsed) {
        const remoteId = parsed.args[1];

        if (!remoteId) {
            // Sync all remotes when no specific remote is provided
            return await this.syncAllRemotes();
        }

        try {
            const remote = await this.remoteStore.getRemote(remoteId);
            if (!remote) {
                throw new Error(`Remote '${remoteId}' not found`);
            }

            console.log(chalk.blue(`Syncing with remote '${remoteId}'...`));

            // Create API client for this remote
            const apiClient = await this.createRemoteApiClient(remoteId);

            // Test connection and fetch server info
            const pingResponse = await apiClient.ping();
            console.log(chalk.green('  ✓ Connection verified'));

            // Extract version information from ping response
            const serverInfo =
        pingResponse.payload || pingResponse.data || pingResponse;
            if (serverInfo.version) {
                console.log(chalk.gray(`    Server version: ${serverInfo.version}`));
                // Update remote with version info
                await this.remoteStore.updateRemote(remoteId, {
                    version: serverInfo.version,
                    appName: serverInfo.appName || 'canvas-server',
                });
            }

            // Sync workspaces
            console.log('  📦 Syncing workspaces...');
            const workspacesResponse = await apiClient.getWorkspaces();
            const workspaces =
        workspacesResponse.payload ||
        workspacesResponse.data ||
        workspacesResponse;

            if (Array.isArray(workspaces)) {
                const fetchedKeys = new Set();
                for (const workspace of workspaces) {
                    const workspaceKey = `${remoteId}:${workspace.id || workspace.name}`;
                    fetchedKeys.add(workspaceKey);
                    await this.remoteStore.updateWorkspace(workspaceKey, workspace);
                }
                // Remove stale local workspaces for this remote
                const localWorkspaces = await this.remoteStore.getWorkspaces();
                for (const key of Object.keys(localWorkspaces)) {
                    if (key.startsWith(`${remoteId}:`) && !fetchedKeys.has(key)) {
                        await this.remoteStore.removeWorkspace(key);
                    }
                }
                console.log(
                    chalk.green(`    ✓ Synced ${workspaces.length} workspaces`),
                );
            }

            // Sync contexts
            console.log('  📋 Syncing contexts...');
            const contextsResponse = await apiClient.getContexts();
            const contexts =
        contextsResponse.payload || contextsResponse.data || contextsResponse;

            if (Array.isArray(contexts)) {
                const fetchedContextKeys = new Set();
                for (const context of contexts) {
                    const contextKey = `${remoteId}:${context.id}`;
                    fetchedContextKeys.add(contextKey);
                    await this.remoteStore.updateContext(contextKey, context);
                }
                // Remove stale local contexts for this remote
                const localContexts = await this.remoteStore.getContexts();
                for (const key of Object.keys(localContexts)) {
                    if (key.startsWith(`${remoteId}:`) && !fetchedContextKeys.has(key)) {
                        await this.remoteStore.removeContext(key);
                    }
                }
                console.log(chalk.green(`    ✓ Synced ${contexts.length} contexts`));
            }

            // Update last synced timestamp
            await this.remoteStore.updateRemote(remoteId, {
                lastSynced: new Date().toISOString(),
            });

            console.log(chalk.green(`✓ Sync completed for remote '${remoteId}'`));
            return 0;
        } catch (error) {
            throw new Error(`Failed to sync remote: ${error.message}`);
        }
    }

    /**
   * Sync all configured remotes
   */
    async syncAllRemotes() {
        try {
            const remotes = await this.remoteStore.getRemotes();

            if (Object.keys(remotes).length === 0) {
                console.log(chalk.yellow('No remotes configured'));
                console.log();
                console.log(chalk.cyan('Add a remote with:'));
                console.log('  canvas remote add user@remote-name https://server-url');
                return 0;
            }

            console.log(chalk.blue(`Syncing all ${Object.keys(remotes).length} remotes...`));
            console.log();

            let successCount = 0;
            let errorCount = 0;

            for (const [remoteId, remote] of Object.entries(remotes)) {
                try {
                    console.log(chalk.blue(`Syncing remote '${remoteId}'...`));

                    // Create API client for this remote
                    const apiClient = await this.createRemoteApiClient(remoteId);

                    // Test connection and fetch server info
                    const pingResponse = await apiClient.ping();
                    console.log(chalk.green('  ✓ Connection verified'));

                    // Extract version information from ping response
                    const serverInfo = pingResponse.payload || pingResponse.data || pingResponse;
                    if (serverInfo.version) {
                        console.log(chalk.gray(`    Server version: ${serverInfo.version}`));
                        // Update remote with version info
                        await this.remoteStore.updateRemote(remoteId, {
                            version: serverInfo.version,
                            appName: serverInfo.appName || 'canvas-server',
                        });
                    }

                    // Sync workspaces
                    console.log('  📦 Syncing workspaces...');
                    const workspacesResponse = await apiClient.getWorkspaces();
                    const workspaces = workspacesResponse.payload || workspacesResponse.data || workspacesResponse;

                    if (Array.isArray(workspaces)) {
                        const fetchedKeys = new Set();
                        for (const workspace of workspaces) {
                            const workspaceKey = `${remoteId}:${workspace.id || workspace.name}`;
                            fetchedKeys.add(workspaceKey);
                            await this.remoteStore.updateWorkspace(workspaceKey, workspace);
                        }
                        // Remove stale local workspaces for this remote
                        const localWorkspaces = await this.remoteStore.getWorkspaces();
                        for (const key of Object.keys(localWorkspaces)) {
                            if (key.startsWith(`${remoteId}:`) && !fetchedKeys.has(key)) {
                                await this.remoteStore.removeWorkspace(key);
                            }
                        }
                        console.log(chalk.green(`    ✓ Synced ${workspaces.length} workspaces`));
                    }

                    // Sync contexts
                    console.log('  📋 Syncing contexts...');
                    const contextsResponse = await apiClient.getContexts();
                    const contexts = contextsResponse.payload || contextsResponse.data || contextsResponse;

                    if (Array.isArray(contexts)) {
                        const fetchedContextKeys = new Set();
                        for (const context of contexts) {
                            const contextKey = `${remoteId}:${context.id}`;
                            fetchedContextKeys.add(contextKey);
                            await this.remoteStore.updateContext(contextKey, context);
                        }
                        // Remove stale local contexts for this remote
                        const localContexts = await this.remoteStore.getContexts();
                        for (const key of Object.keys(localContexts)) {
                            if (key.startsWith(`${remoteId}:`) && !fetchedContextKeys.has(key)) {
                                await this.remoteStore.removeContext(key);
                            }
                        }
                        console.log(chalk.green(`    ✓ Synced ${contexts.length} contexts`));
                    }

                    // Update last synced timestamp
                    await this.remoteStore.updateRemote(remoteId, {
                        lastSynced: new Date().toISOString(),
                    });

                    console.log(chalk.green(`✓ Sync completed for remote '${remoteId}'`));
                    successCount++;

                } catch (error) {
                    console.log(chalk.red(`✗ Failed to sync remote '${remoteId}': ${error.message}`));
                    errorCount++;
                }

                console.log(); // Add spacing between remotes
            }

            // Summary
            console.log(chalk.bold('Sync Summary:'));
            console.log(`  ✓ Successfully synced: ${successCount} remotes`);
            if (errorCount > 0) {
                console.log(`  ✗ Failed to sync: ${errorCount} remotes`);
            }

            if (successCount > 0) {
                console.log(chalk.green(`✓ Overall sync completed successfully`));
            } else {
                console.log(chalk.red(`✗ No remotes were synced successfully`));
                return 1;
            }

            return 0;
        } catch (error) {
            throw new Error(`Failed to sync all remotes: ${error.message}`);
        }
    }

    /**
   * Ping a remote to test connectivity
   */
    async handlePing(parsed) {
        const remoteId = parsed.args[1];

        if (!remoteId) {
            throw new Error('Remote identifier is required');
        }

        try {
            const remote = await this.remoteStore.getRemote(remoteId);
            if (!remote) {
                throw new Error(`Remote '${remoteId}' not found`);
            }

            console.log(
                chalk.blue(`Pinging remote '${remoteId}' at ${remote.url}...`),
            );

            const apiClient = await this.createRemoteApiClient(remoteId);
            const start = Date.now();

            const response = await apiClient.ping();
            const duration = Date.now() - start;

            const serverInfo = response.payload || response.data || response;

            console.log(
                chalk.green(`✓ Remote '${remoteId}' is reachable (${duration}ms)`),
            );
            if (serverInfo.version) {
                console.log(`  Server Version: ${serverInfo.version}`);
            }
            if (serverInfo.environment) {
                console.log(`  Environment: ${serverInfo.environment}`);
            }
            if (serverInfo.hostname) {
                console.log(`  Hostname: ${serverInfo.hostname}`);
            }

            return 0;
        } catch (error) {
            console.log(chalk.red(`✗ Remote '${remoteId}' is not reachable`));
            console.log(`  Error: ${error.message}`);
            return 1;
        }
    }

    /**
   * Bind to a remote as default
   */
    async handleBind(parsed) {
        const remoteId = parsed.args[1];

        if (!remoteId) {
            throw new Error('Remote identifier is required');
        }

        try {
            const remote = await this.remoteStore.getRemote(remoteId);
            if (!remote) {
                throw new Error(`Remote '${remoteId}' not found`);
            }

            // Check remote connectivity status
            let remoteStatus = 'disconnected';
            let syncSuccess = false;

            await this.remoteStore.updateSession({
                boundRemote: remoteId,
                boundRemoteStatus: remoteStatus, // Will be updated after connection test
                boundAt: new Date().toISOString(),
            });

            console.log(chalk.green(`✓ Bound to remote '${remoteId}' as default`));
            console.log(`  URL: ${remote.url}`);
            console.log(`  Version: ${remote.version || 'Unknown'}`);

            // Automatically sync after binding
            console.log();
            console.log(chalk.blue(`Syncing with remote '${remoteId}'...`));

            try {
                // Create API client for this remote
                const apiClient = await this.createRemoteApiClient(remoteId);

                // Test connection
                await apiClient.ping();
                remoteStatus = 'connected';
                console.log(chalk.green('  ✓ Connection verified'));

                // Sync workspaces
                console.log('  📦 Syncing workspaces...');
                const workspacesResponse = await apiClient.getWorkspaces();
                const workspaces =
          workspacesResponse.payload ||
          workspacesResponse.data ||
          workspacesResponse;

                if (Array.isArray(workspaces)) {
                    for (const workspace of workspaces) {
                        const workspaceKey = `${remoteId}:${workspace.id || workspace.name}`;
                        await this.remoteStore.updateWorkspace(workspaceKey, workspace);
                    }
                    console.log(
                        chalk.green(`    ✓ Synced ${workspaces.length} workspaces`),
                    );
                }

                // Sync contexts
                console.log('  📋 Syncing contexts...');
                const contextsResponse = await apiClient.getContexts();
                const contexts =
          contextsResponse.payload || contextsResponse.data || contextsResponse;

                if (Array.isArray(contexts)) {
                    for (const context of contexts) {
                        const contextKey = `${remoteId}:${context.id}`;
                        await this.remoteStore.updateContext(contextKey, context);
                    }
                    console.log(chalk.green(`    ✓ Synced ${contexts.length} contexts`));
                }

                // Update last synced timestamp
                await this.remoteStore.updateRemote(remoteId, {
                    lastSynced: new Date().toISOString(),
                });

                console.log(chalk.green(`✓ Sync completed for remote '${remoteId}'`));
                syncSuccess = true;
            } catch (syncError) {
                console.log(chalk.yellow(`⚠ Sync failed: ${syncError.message}`));
                console.log(
                    chalk.yellow(
                        '  Remote bound successfully but sync failed. You can manually sync later with:',
                    ),
                );
                console.log(`  canvas remote sync ${remoteId}`);
            }

            // Update session with final remote status
            await this.remoteStore.updateSession({
                boundRemoteStatus: remoteStatus,
            });

            return 0;
        } catch (error) {
            throw new Error(`Failed to bind remote: ${error.message}`);
        }
    }

    /**
   * Login to a remote (JWT authentication)
   */
    async handleLogin(parsed) {
        const remoteId = parsed.args[1];

        if (!remoteId) {
            throw new Error('Remote identifier is required');
        }

        return await this.performLogin(remoteId, parsed.options);
    }

    /**
   * Perform login to a remote with secure password input
   */
    async performLogin(remoteId, options = {}) {
        try {
            const remote = await this.remoteStore.getRemote(remoteId);
            if (!remote) {
                throw new Error(`Remote '${remoteId}' not found`);
            }

            let email = options.email || options.username;
            let password = options.password;
            const token = options.token;

            // If token is provided, use token-based authentication
            if (token) {
                console.log(
                    chalk.blue(`Logging into remote '${remoteId}' with token...`),
                );

                // Update remote config with new token
                await this.remoteStore.updateRemote(remoteId, {
                    auth: {
                        method: 'token',
                        tokenType: 'jwt',
                        token: token,
                    },
                });

                console.log(
                    chalk.green(`✓ Successfully logged into '${remoteId}' with token`),
                );
                console.log(chalk.gray('Token stored in remote configuration'));
                return 0;
            }

            // For email-based authentication, prompt for email if not provided
            if (!email) {
                try {
                    email = await this.promptForInput('Email: ');
                } catch (error) {
                    throw new Error(
                        'Email is required for login. Use --email option or provide interactively.',
                    );
                }
            }

            if (!email) {
                throw new Error(
                    'Email is required. Use --email option or provide when prompted.',
                );
            }

            // Prompt for password securely if not provided
            if (!password) {
                try {
                    password = await this.promptForPassword('Password: ');
                } catch (error) {
                    throw new Error(
                        'Password is required for login. Use --password option or provide interactively.',
                    );
                }
            }

            if (!password) {
                throw new Error(
                    'Password is required. Use --password option or provide when prompted.',
                );
            }

            console.log(
                chalk.blue(`Logging into remote '${remoteId}' as ${email}...`),
            );

            const apiClient = await this.createRemoteApiClient(remoteId);
            const response = await apiClient.login({ email, password });

            const responseData = response.payload || response.data || response;
            const { token: authToken, user } = responseData;

            // Update remote config with new token
            await this.remoteStore.updateRemote(remoteId, {
                auth: {
                    method: 'token',
                    tokenType: 'jwt',
                    token: authToken,
                },
            });

            console.log(
                chalk.green(
                    `✓ Successfully logged into '${remoteId}' as ${user.name || user.email}`,
                ),
            );
            console.log(chalk.gray('Token stored in remote configuration'));

            return 0;
        } catch (error) {
            throw new Error(`Login failed: ${error.message}`);
        }
    }

    /**
   * Logout from a remote
   */
    async handleLogout(parsed) {
        const remoteId = parsed.args[1];

        if (!remoteId) {
            throw new Error('Remote identifier is required');
        }

        try {
            const remote = await this.remoteStore.getRemote(remoteId);
            if (!remote) {
                throw new Error(`Remote '${remoteId}' not found`);
            }

            // Try to logout on server
            try {
                const apiClient = await this.createRemoteApiClient(remoteId);
                await apiClient.logout();
            } catch (error) {
                console.log(
                    chalk.yellow(
                        '⚠ Server logout may have failed, clearing local token',
                    ),
                );
            }

            // Clear token from local config
            await this.remoteStore.updateRemote(remoteId, {
                auth: {
                    method: 'password',
                    tokenType: 'jwt',
                    token: '',
                },
            });

            console.log(chalk.green(`✓ Logged out from remote '${remoteId}'`));
            return 0;
        } catch (error) {
            throw new Error(`Logout failed: ${error.message}`);
        }
    }

    /**
   * Rename a remote
   */
    async handleRename(parsed) {
        const oldRemoteId = parsed.args[1];
        const newRemoteId = parsed.args[2];

        if (!oldRemoteId || !newRemoteId) {
            throw new Error('Both old and new remote identifiers are required');
        }

        // Validate new remote identifier format
        const parsedNewRemote = parseRemoteIdentifier(newRemoteId);
        if (!parsedNewRemote) {
            throw new Error(
                'Invalid new remote identifier format. Use: user@remote-name',
            );
        }

        try {
            const oldRemote = await this.remoteStore.getRemote(oldRemoteId);
            if (!oldRemote) {
                throw new Error(`Remote '${oldRemoteId}' not found`);
            }

            const existingNewRemote = await this.remoteStore.getRemote(newRemoteId);
            if (existingNewRemote) {
                throw new Error(`Remote '${newRemoteId}' already exists`);
            }

            // Add with new name and remove old
            await this.remoteStore.addRemote(newRemoteId, oldRemote);
            await this.remoteStore.removeRemote(oldRemoteId);

            // Update session if this was the bound remote
            const session = await this.remoteStore.getSession();
            if (session.boundRemote === oldRemoteId) {
                await this.remoteStore.updateSession({
                    boundRemote: newRemoteId,
                });
            }

            console.log(
                chalk.green(
                    `✓ Remote renamed from '${oldRemoteId}' to '${newRemoteId}'`,
                ),
            );
            return 0;
        } catch (error) {
            throw new Error(`Failed to rename remote: ${error.message}`);
        }
    }

    /**
   * Show remote details
   */
    async handleShow(parsed) {
        const remoteId = parsed.args[1];

        if (!remoteId) {
            throw new Error('Remote identifier is required');
        }

        try {
            const remote = await this.remoteStore.getRemote(remoteId);
            if (!remote) {
                throw new Error(`Remote '${remoteId}' not found`);
            }

            const session = await this.remoteStore.getSession();

            console.log(chalk.bold(`Remote Details: ${remoteId}`));
            console.log();
            console.log(`URL: ${remote.url}`);
            console.log(`API Base: ${remote.apiBase}`);
            console.log(`Version: ${remote.version || 'Unknown'}`);
            console.log(`Authentication: ${remote.auth?.method || 'unknown'}`);
            console.log(`Token Type: ${remote.auth?.tokenType || 'N/A'}`);
            console.log(`Has Token: ${remote.auth?.token ? 'Yes' : 'No'}`);
            console.log(
                `Last Synced: ${remote.lastSynced ? new Date(remote.lastSynced).toLocaleString() : 'Never'}`,
            );
            console.log(
                `Is Default: ${session.boundRemote === remoteId ? 'Yes' : 'No'}`,
            );
            console.log(
                `Is Local: ${isLocalRemote(parseRemoteIdentifier(remoteId)?.remote) ? 'Yes' : 'No'}`,
            );

            // Show cached resources count
            const contexts = await this.remoteStore.getContexts();
            const workspaces = await this.remoteStore.getWorkspaces();

            const remoteContexts = Object.keys(contexts).filter((key) =>
                key.startsWith(`${remoteId}:`),
            );
            const remoteWorkspaces = Object.keys(workspaces).filter((key) =>
                key.startsWith(`${remoteId}:`),
            );

            console.log();
            console.log(chalk.cyan('Cached Resources:'));
            console.log(`  Workspaces: ${remoteWorkspaces.length}`);
            console.log(`  Contexts: ${remoteContexts.length}`);

            return 0;
        } catch (error) {
            throw new Error(`Failed to show remote details: ${error.message}`);
        }
    }

    /**
   * Show current remote
   */
    async handleCurrent(parsed) {
        try {
            const session = await this.remoteStore.getSession();

            if (!session.boundRemote) {
                console.log(chalk.yellow('No remote currently bound'));
                console.log();
                console.log(chalk.cyan('Bind to a remote with:'));
                console.log('  canvas remote bind <user@remote>');
                return 1;
            }

            const remote = await this.remoteStore.getRemote(session.boundRemote);
            if (!remote) {
                console.log(
                    chalk.red(
                        `Current remote '${session.boundRemote}' not found in configuration`,
                    ),
                );
                console.log(
                    chalk.yellow(
                        'The remote may have been removed. Re-add it or bind to a different remote.',
                    ),
                );
                return 1;
            }

            console.log(chalk.cyan('Current remote:'), session.boundRemote);
            console.log(`  URL: ${remote.url}`);
            console.log(`  Version: ${remote.version || 'Unknown'}`);
            console.log(
                `  Last Synced: ${remote.lastSynced ? new Date(remote.lastSynced).toLocaleString() : 'Never'}`,
            );
            if (session.boundAt) {
                console.log(
                    `  Bound At: ${new Date(session.boundAt).toLocaleString()}`,
                );
            }

            return 0;
        } catch (error) {
            throw new Error(`Failed to get current remote: ${error.message}`);
        }
    }

    /**
   * Helper methods
   */

    async createRemoteApiClient(remoteId) {
    // Use the enhanced API client to get a client for the specific remote
        return this.apiClient.getApiClient(remoteId);
    }

    getRemoteStatus(remoteConfig) {
        if (!remoteConfig.auth?.token) {
            return chalk.yellow('No Token');
        }
        if (remoteConfig.lastSynced) {
            const lastSync = new Date(remoteConfig.lastSynced);
            const hoursSinceSync =
        (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
            if (hoursSinceSync < 1) {
                return chalk.green('Synced');
            } else if (hoursSinceSync < 24) {
                return chalk.yellow('Stale');
            } else {
                return chalk.red('Old');
            }
        }
        return chalk.gray('Unknown');
    }

    /**
   * Helper method to prompt for input
   */
    async promptForInput(prompt) {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        return new Promise((resolve) => {
            rl.question(prompt, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }

    /**
   * Helper method to prompt for password securely (no echo)
   */
    async promptForPassword(prompt) {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        return new Promise((resolve) => {
            // Enable muted mode
            rl.stdoutMuted = true;
            rl.query = prompt;

            // Override the _writeToOutput method to control what gets displayed
            rl._writeToOutput = function _writeToOutput(stringToWrite) {
                if (rl.stdoutMuted) {
                    // Show only asterisks - one for each character in the line
                    const asterisks = '*'.repeat(rl.line.length);
                    rl.output.write('\x1B[2K\x1B[200D' + rl.query + asterisks);
                } else {
                    rl.output.write(stringToWrite);
                }
            };

            rl.question(rl.query, function (password) {
                rl.output.write('\n');
                rl.close();
                resolve(password);
            });
        });
    }

    /**
   * Helper method to prompt for yes/no confirmation
   */
    async promptYesNo(prompt, defaultValue = false) {
        const defaultText = defaultValue ? 'Y/n' : 'y/N';
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        return new Promise((resolve) => {
            rl.question(`${prompt} (${defaultText}): `, (answer) => {
                rl.close();
                const trimmed = answer.toLowerCase().trim();
                if (trimmed === '') {
                    resolve(defaultValue);
                } else if (trimmed === 'y' || trimmed === 'yes') {
                    resolve(true);
                } else if (trimmed === 'n' || trimmed === 'no') {
                    resolve(false);
                } else {
                    // Invalid input, ask again
                    process.stdout.write('Please answer yes or no.\n');
                    this.promptYesNo(prompt, defaultValue).then(resolve);
                }
            });
        });
    }

    /**
   * Show help
   */
    showHelp() {
        console.log(chalk.bold('Remote Commands:'));
        console.log('  add <user@remote> <url>    Add a new remote server');
        console.log('  list                       List all configured remotes');
        console.log('  remove <user@remote>       Remove a remote server');
        console.log(
            '  sync [user@remote]         Sync workspaces and contexts from remote (or all if no remote specified)',
        );
        console.log('  ping <user@remote>         Test connectivity to remote');
        console.log(
            '  bind <user@remote>         Set remote as default (auto-syncs)',
        );
        console.log('  login <user@remote>        Login to remote (JWT)');
        console.log('  logout <user@remote>       Logout from remote');
        console.log('  rename <old> <new>         Rename a remote identifier');
        console.log(
            '  show <user@remote>         Show detailed remote information',
        );
        console.log('  current                    Show the currently bound remote');
        console.log();
        console.log(chalk.bold('Options:'));
        console.log('  --token <token>           API token for authentication');
        console.log(
            '  --email <email>           Email for login (required for email auth)',
        );
        console.log(
            '  --username <email>        Email for login (alias for --email)',
        );
        console.log(
            '  --password <password>     Password for login (will prompt securely if not provided)',
        );
        console.log(
            '  --api-base <path>         API base path (default: /rest/v2)',
        );
        console.log(
            '  --force                   Force action without confirmation',
        );
        console.log();
        console.log(chalk.bold('Examples:'));
        console.log('  canvas remote add admin@canvas.local http://localhost:8001');
        console.log(
            '  canvas remote add user@work.server https://canvas.company.com --token canvas-abc123',
        );
        console.log('  canvas remote list');
        console.log('  canvas remote sync                    # Sync all remotes');
        console.log('  canvas remote sync admin@canvas.local  # Sync specific remote');
        console.log('  canvas remote bind admin@canvas.local');
        console.log(
            '  canvas remote login user@work.server --email user@company.com',
        );
        console.log(
            '  canvas remote login user@work.server --token your-api-token',
        );
        console.log('  canvas remote ping admin@canvas.local');
        console.log('  canvas remote show admin@canvas.local');
        console.log('  canvas remote rename old@server new@server');
        console.log('  canvas remote remove old@server --force');
        console.log('  canvas remote current');
        console.log();
        console.log(chalk.bold('Remote Identifier Format:'));
        console.log(
            '  user@remote-name          Where user is your username on that remote',
        );
        console.log('  admin@canvas.local        Local Canvas server');
        console.log('  john@work.company.com     Remote Canvas server');
        console.log();
        console.log(chalk.bold('Authentication:'));
        console.log(
            '  For email/password auth: Use --email (password will be prompted securely)',
        );
        console.log('  For token auth: Use --token with your API token');
        console.log(
            '  Interactive login: Run without --email or --token to be prompted',
        );
        console.log();
        console.log(
            chalk.cyan(
                'Note: After adding a remote, use sync to fetch available workspaces and contexts.',
            ),
        );
        console.log(
            chalk.cyan(
                'Use "canvas remote sync" without parameters to sync all configured remotes.',
            ),
        );
        console.log(
            chalk.cyan(
                'Server version is automatically fetched and displayed during remote addition.',
            ),
        );
        console.log(
            chalk.cyan(
                'The bind command automatically syncs workspaces and contexts after binding.',
            ),
        );
        console.log(
            chalk.cyan(
                'First remote added is automatically set as default and offers login prompt.',
            ),
        );
    }
}

export default RemoteCommand;

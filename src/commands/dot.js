'use strict';

import chalk from 'chalk';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import readline from 'readline';
import { spawn } from 'child_process';
import BaseCommand from './base.js';
import { parseResourceAddress } from '../utils/address-parser.js';
import { CANVAS_DIR_CONFIG } from '../utils/config.js';
import { DATA_TYPES, getWorkspaceDataDir } from '../utils/workspace-data.js';

/**
 * Constants
 */
const DOTFILES_CONFIG_FILE = path.join(CANVAS_DIR_CONFIG, 'dotfiles.json');

/**
 * Dotfile manager command
 */
export class DotCommand extends BaseCommand {
    constructor(config) {
        super(config);
        this.options = null;
    }

    async execute(parsed) {
        try {
            this.options = parsed.options;

            // Collect client context for this execution
            this.collectClientContext();

            // If no arguments, default to list
            if (parsed.args.length === 0) {
                return await this.handleList(parsed);
            }

            const action = parsed.args[0];
            // Support kebab-case commands like install-hooks
            const methodSuffix = action
                .split('-')
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join('');
            const methodName = `handle${methodSuffix}`;

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
   * Parse and validate dotfile address
   * Supports: user@remote:workspace/path or workspace/path (using current session)
   */
    async parseAddress(addressStr) {
        if (!addressStr) {
            throw new Error('Address is required');
        }

        // If address contains @ and :, it's a full address
        if (addressStr.includes('@') && addressStr.includes(':')) {
            const parsed = parseResourceAddress(addressStr);
            if (!parsed) {
                throw new Error(`Invalid address format: ${addressStr}`);
            }
            return parsed;
        }

        // Otherwise, use current session context
        const session = await this.apiClient.remoteStore.getSession();
        if (!session.boundRemote) {
            throw new Error(
                'No remote bound. Use full address format user@remote:workspace or bind a remote with: canvas remote bind <user@remote>',
            );
        }

        const [user, remote] = session.boundRemote.split('@');
        const [workspace, ...pathParts] = addressStr.split('/');
        const resourcePath = pathParts.length > 0 ? '/' + pathParts.join('/') : '';

        return {
            userIdentifier: user,
            remote: remote,
            resource: workspace,
            path: resourcePath,
            full: `${user}@${remote}:${workspace}${resourcePath}`,
            isLocal: false,
            isRemote: true,
            resourceType: 'workspace',
        };
    }

    /**
   * Get local dotfiles directory for an address
   */
    getLocalDotfilesDir(address) {
        return getWorkspaceDataDir(address, DATA_TYPES.DOTFILES);
    }

    /**
   * Load dotfiles index
   */
    async loadDotfilesIndex() {
        try {
            if (!existsSync(DOTFILES_CONFIG_FILE)) {
                return {};
            }
            const content = await fs.readFile(DOTFILES_CONFIG_FILE, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.warn(
                chalk.yellow(
                    'Warning: Could not load dotfiles index, using empty index',
                ),
            );
            return {};
        }
    }

    /**
   * Save dotfiles index
   */
    async saveDotfilesIndex(index) {
        const configDir = path.dirname(DOTFILES_CONFIG_FILE);
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(DOTFILES_CONFIG_FILE, JSON.stringify(index, null, 2));
    }

    /**
   * Update dotfiles index entry
   */
    async updateIndexEntry(address, updates) {
        const index = await this.loadDotfilesIndex();
        const key = `${address.userIdentifier}@${address.remote}:${address.resource}`;

        if (!index[key]) {
            index[key] = {
                path: this.getLocalDotfilesDir(address),
                status: 'inactive',
                files: [],
            };
        }

        Object.assign(index[key], updates);
        await this.saveDotfilesIndex(index);
        return index[key];
    }

    /**
   * Execute git command
   */
    async execGit(args, cwd) {
        return new Promise((resolve, reject) => {
            const git = spawn('git', args, {
                cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';

            git.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            git.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            git.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    reject(new Error(`Git command failed (${code}): ${stderr}`));
                }
            });

            git.on('error', reject);
        });
    }

    /**
   * Get Canvas API token for git authentication
   */
    async getApiToken(remoteId) {
    // Get token from remote configuration
        const remote = await this.apiClient.remoteStore.getRemote(remoteId);
        if (remote?.auth?.token) {
            return remote.auth.token;
        }

        // Fallback to config token (for backwards compatibility)
        return this.config.get('server.auth.token');
    }

    /**
   * Build git URL for Canvas dotfiles repository
   */
    async buildGitUrl(address) {
    // Get remote URL from config
        const remotes = await this.apiClient.remoteStore.getRemotes();
        const remoteKey = `${address.userIdentifier}@${address.remote}`;
        const remoteConfig = remotes[remoteKey];

        if (!remoteConfig) {
            throw new Error(`Remote ${remoteKey} not found`);
        }

        const baseUrl = remoteConfig.url.replace(/\/$/, ''); // Remove trailing slash
        return `${baseUrl}/rest/v2/workspaces/${address.resource}/dotfiles/git/`;
    }

    // Command handlers

    /**
   * List all dotfiles
   */
    async handleList(parsed) {
        try {
            // Load local index for activation status
            const localIndex = await this.loadDotfilesIndex();

            // Resolve context path filter (defaults to current context)
            let contextPath = '/';
            let contextId = null;
            let workspaceId = null;

            try {
                if (this.options?.context) {
                    contextPath = this.options.context;
                }

                // Get current context to determine workspace
                const contextAddress = await this.getCurrentContext();
                contextId = contextAddress;
                const ctxResp = await this.apiClient.getContext(contextAddress);
                let ctx = ctxResp.payload || ctxResp.data || ctxResp;
                if (ctx && ctx.context) ctx = ctx.context;
                workspaceId = ctx?.workspaceId;

                // If no context path specified, use current context path
                if (!this.options?.context) {
                    contextPath = ctx?.path || '/';
                }
            } catch (err) {
                console.log(chalk.yellow('Warning: Could not determine current context, showing all local dotfiles only'));
                contextPath = '/';
            }

                        // Query dotfiles from database
            let databaseDotfiles = [];
            try {
                await this.checkConnection();
                if (contextId) {
                    // Get dotfiles for current context (which filters by context automatically)
                    const response = await this.apiClient.getDotfilesByContext(contextId);
                    const result = response.payload || response.data || response;
                    databaseDotfiles = Array.isArray(result) ? result : [];
                }
            } catch (err) {
                console.log(chalk.yellow('Warning: Could not fetch dotfiles from database, showing local index only'));
                this.debug('Database query error:', err.message);
            }

            const normalizedPath = contextPath === '/' ? '' : contextPath.replace(/^\/+/, '').replace(/\/+$/, '');

            // Combine database and local information
            const dotfileMap = new Map();

            // Add database dotfiles
            for (const doc of databaseDotfiles) {
                const dotfileData = doc.data || doc;
                const localPath = dotfileData.localPath;
                const displayRemote = dotfileData.repoPath;
                const docId = doc.id;

                // Filter by context path if specified
                if (
                    normalizedPath &&
                    (!displayRemote || (
                        !displayRemote.includes(`/${normalizedPath}/`) &&
                        !displayRemote.endsWith(`/${normalizedPath}`)
                    ))
                ) {
                    continue;
                }

                const key = `${localPath} → ${displayRemote}`;
                dotfileMap.set(key, {
                    localPath,
                    remotePath: displayRemote,
                    docId,
                    priority: dotfileData.priority || 0,
                    backupPath: dotfileData.backupPath,
                    source: 'database',
                    active: false, // Will be updated from local index
                });
            }

            // Add/update with local index information
            for (const [indexKey, config] of Object.entries(localIndex)) {
                for (const file of config.files || []) {
                    // Filter by context path
                    if (normalizedPath && !file.dst.startsWith(normalizedPath)) {
                        continue;
                    }

                    const key = `${file.src} → ${file.dst}`;
                    const existing = dotfileMap.get(key);
                    if (existing) {
                        // Update activation status from local index
                        existing.active = file.active || false;
                        existing.localIndexEntry = file;
                    } else {
                        // Add local-only entry
                        dotfileMap.set(key, {
                            localPath: file.src,
                            remotePath: file.dst,
                            docId: null,
                            priority: 0,
                            source: 'local-only',
                            active: file.active || false,
                            localIndexEntry: file,
                            type: file.type
                        });
                    }
                }
            }

            if (dotfileMap.size === 0) {
                console.log(chalk.gray('No dotfiles found'));
                return 0;
            }

            console.log(chalk.bold('Dotfiles:'));

            // Sort by priority and local path
            const sortedDotfiles = Array.from(dotfileMap.entries()).sort(([, a], [, b]) => {
                if (a.priority !== b.priority) return b.priority - a.priority;
                return a.localPath.localeCompare(b.localPath);
            });

            for (const [key, dotfile] of sortedDotfiles) {
                const status = dotfile.active ? chalk.green('●') : chalk.gray('○');
                const sourceIndicator = dotfile.source === 'database' ? '' : chalk.yellow(' (local only)');
                const priorityStr = dotfile.priority !== 0 ? chalk.gray(` [${dotfile.priority}]`) : '';
                const docIdStr = dotfile.docId ? chalk.gray(` #${dotfile.docId}`) : '';

                let displayPath = dotfile.localPath;
                if (dotfile.type === 'folder' || (dotfile.localIndexEntry && dotfile.localIndexEntry.type === 'folder')) {
                    displayPath = `📁 ${displayPath}`;
                }

                console.log(`${status} ${displayPath} → ${dotfile.remotePath}${priorityStr}${docIdStr}${sourceIndicator}`);

                if (dotfile.backupPath) {
                    console.log(chalk.gray(`    backup: ${dotfile.backupPath}`));
                }
            }

            return 0;
        } catch (error) {
            throw new Error(`Failed to list dotfiles: ${error.message}`);
        }
    }

    /**
   * Initialize remote dotfiles repository
   */
    async handleInit(parsed) {
        const addressStr = parsed.args[1];
        if (!addressStr) {
            throw new Error('Address is required: dot init user@remote:workspace');
        }

        const address = await this.parseAddress(addressStr);

        try {
            await this.checkConnection();

            // Get the API client for the specific remote
            const remoteId = `${address.userIdentifier}@${address.remote}`;
            const apiClient = await this.apiClient.getApiClient(remoteId);

            const response = await apiClient.client.post(
                `/workspaces/${address.resource}/dotfiles/init`,
                {},
            );

            if (response.data.status === 'success') {
                console.log(
                    chalk.green(`✓ Dotfiles repository initialized for ${address.full}`),
                );

                // Update index
                await this.updateIndexEntry(address, {
                    status: 'initialized',
                });

                return 0;
            } else {
                throw new Error(
                    response.data.message || 'Failed to initialize repository',
                );
            }
        } catch (error) {
            if (error.response?.data?.message) {
                throw new Error(error.response.data.message);
            }
            throw error;
        }
    }

    /**
   * Clone dotfiles repository
   */
    async handleClone(parsed) {
        const addressStr = parsed.args[1];
        if (!addressStr) {
            throw new Error('Address is required: dot clone user@remote:workspace');
        }

        const address = await this.parseAddress(addressStr);
        const localDir = this.getLocalDotfilesDir(address);
        const remoteId = `${address.userIdentifier}@${address.remote}`;
        const gitUrl = await this.buildGitUrl(address);
        const token = await this.getApiToken(remoteId);

        // Create authenticated URL
        const authUrl = gitUrl.replace('://', `://user:${token}@`);

        try {
            // Create parent directory
            await fs.mkdir(path.dirname(localDir), { recursive: true });

            // Clone repository
            console.log(chalk.blue(`Cloning ${address.full}...`));
            await this.execGit(['clone', authUrl, localDir]);

            console.log(chalk.green(`✓ Cloned to ${localDir}`));

            // Tip for installing hooks
            console.log(chalk.gray('Tip: install hooks for encryption/decryption automation → run:'));
            console.log(chalk.gray(`  canvas dot install-hooks ${address.full}`));

            // Update index
            await this.updateIndexEntry(address, {
                status: 'cloned',
                clonedAt: new Date().toISOString(),
            });

            return 0;
        } catch (error) {
            throw new Error(`Failed to clone repository: ${error.message}`);
        }
    }

    /**
   * Execute system command
   */
    async execCommand(command, args, cwd = process.cwd()) {
        return new Promise((resolve, reject) => {
            const proc = spawn(command, args, {
                cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    reject(new Error(`Command failed (${code}): ${stderr || stdout}`));
                }
            });

            proc.on('error', reject);
        });
    }

    /**
   * Simple yes/no prompt on TTY (returns boolean)
   */
    async promptYesNo(question) {
        if (!process.stdin.isTTY) return false;
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            rl.question(chalk.blue(question), (answer) => {
                rl.close();
                resolve(/^y(es)?$/i.test(answer.trim()));
            });
        });
    }

    /**
   * Add dotfile or folder to repository
   */
    async handleAdd(parsed) {
        let srcPath = parsed.args[1];
        const targetSpec = parsed.args[2];

        if (!srcPath || !targetSpec) {
            throw new Error(
                'Usage: dot add <source-path> <user@remote:workspace/destination> or dot add <source-path> <workspace/destination>',
            );
        }

        const address = await this.parseAddress(targetSpec);
        const localDir = this.getLocalDotfilesDir(address);

        if (!existsSync(localDir)) {
            throw new Error(
                `Local dotfiles directory not found. Run: dot clone ${address.full}`,
            );
        }

        // Extract destination path from address
        const destPath = address.path.startsWith('/')
            ? address.path.slice(1)
            : address.path;
        if (!destPath) {
            throw new Error('Destination path is required');
        }

        // Normalize local path to canonical ({{HOME}}/...) but use absolute for FS
        const canonicalSrc = this.normalizeLocalPathInput(srcPath);
        srcPath = canonicalSrc;
        const expandedSrcPath = canonicalSrc
            .replace(/^\{\{\s*HOME\s*\}\}/, os.homedir())
            .replace(/^\$HOME/, os.homedir())
            .replace(/^~/, os.homedir());
        const destFilePath = path.join(localDir, destPath);

        if (!existsSync(expandedSrcPath)) {
            throw new Error(`Source not found: ${expandedSrcPath}`);
        }

        try {
            const stats = await fs.stat(expandedSrcPath);
            const index = await this.loadDotfilesIndex();
            const key = `${address.userIdentifier}@${address.remote}:${address.resource}`;

            if (!index[key]) {
                index[key] = { path: localDir, status: 'inactive', files: [] };
            }

            // Remove existing entries for this source
            index[key].files = index[key].files.filter((f) => f.src !== srcPath);

            if (stats.isFile()) {
                // Handle single file
                await fs.mkdir(path.dirname(destFilePath), { recursive: true });
                await fs.copyFile(expandedSrcPath, destFilePath);
                console.log(chalk.green(`✓ Added file ${srcPath} → ${destPath}`));

                // Add file entry to index
                index[key].files.push({
                    src: srcPath,
                    dst: destPath,
                    type: 'file',
                    active: false,
                    addedAt: new Date().toISOString(),
                });
            } else if (stats.isDirectory()) {
                // Handle directory using cp -r
                console.log(chalk.blue(`Adding folder ${srcPath} → ${destPath}`));

                // Create parent directory if it doesn't exist
                await fs.mkdir(path.dirname(destFilePath), { recursive: true });

                // Use cp -r to copy the directory
                await this.execCommand('cp', ['-r', expandedSrcPath, destFilePath]);

                console.log(chalk.green(`✓ Added folder ${srcPath} → ${destPath}`));

                // Add folder entry to index
                index[key].files.push({
                    src: srcPath,
                    dst: destPath,
                    type: 'folder',
                    active: false,
                    addedAt: new Date().toISOString(),
                });
            } else {
                throw new Error(`Unsupported file type: ${srcPath}`);
            }

            await this.saveDotfilesIndex(index);

            // If --encrypt flag is provided, mark the destination path in encrypted index and ignore decrypted file
            if (this.options && (this.options.encrypt === true || this.options.e === true)) {
                try {
                    await this.ensureEncryptedIndexEntry(localDir, destPath);
                    await this.ensureGitignoreIgnores(localDir, destPath);
                    console.log(chalk.green(`✓ Marked for encryption: ${destPath}`));
                } catch (e) {
                    console.log(chalk.yellow(`Warning: could not update encryption index: ${e.message}`));
                }
            }

            // Create a dotfile document inside the current / specified context
            try {
                // Determine context address and path
                let contextAddress = await this.getCurrentContext(this.options);
                let contextPathInput = this.options?.context || null;

                let contextPath = '/';
                if (contextPathInput) {
                    contextPath = contextPathInput;
                } else {
                    // Fetch current context details to derive path
                    const ctxResp = await this.apiClient.getContext(contextAddress);
                    let ctx = ctxResp.payload || ctxResp.data || ctxResp;
                    if (ctx && ctx.context) ctx = ctx.context;
                    contextPath = ctx?.path || '/';
                }

                const normPath =
                    contextPath === '/' ? '' : contextPath.replace(/^\/+/, '').replace(/\/+$/, '');

                // Build full repo URL and repoPath.
                const repoUrl = (await this.buildGitUrl(address)).replace(/\/$/, '');
                const repoPath = destPath;

                // Determine mapping type based on source stats
                const isDirectory = (await fs.stat(expandedSrcPath)).isDirectory();
                const docData = {
                    schema: 'data/abstraction/dotfile',
                    data: {
                        localPath: canonicalSrc,
                        repoPath: repoPath,
                        type: isDirectory ? 'folder' : 'file',
                        priority: 0,
                    },
                };

                const workspaceAddress = `${address.userIdentifier}@${address.remote}:${address.resource}`;
                // Allow explicit --context to bind immediately
                const useContextPath = this.options?.context || contextPath;
                await this.apiClient.createDocument(
                    workspaceAddress,
                    docData,
                    'workspace',
                    ['data/abstraction/dotfile'],
                    useContextPath,
                );
            } catch (err) {
                this.debug('Failed to create dotfile document:', err.message);
            }

            if (await this.promptYesNo('Commit & sync changes now? (y/N) ')) {
                await this.handleSync({ ...parsed, args: ['sync', address.full] });
            }
            return 0;
        } catch (error) {
            throw new Error(`Failed to add dotfile: ${error.message}`);
        }
    }

    /**
   * Commit changes to repository
   */
    async handleCommit(parsed) {
        const addressStr = parsed.args[1];
        const message = parsed.args[2] || 'Update dotfiles';

        if (!addressStr) {
            throw new Error(
                'Address is required: dot commit user@remote:workspace [message]',
            );
        }

        const address = await this.parseAddress(addressStr);
        const localDir = this.getLocalDotfilesDir(address);

        if (!existsSync(localDir)) {
            throw new Error(
                `Local dotfiles directory not found. Run: dot clone ${address.full}`,
            );
        }

        try {
            // Add all changes
            await this.execGit(['add', '.'], localDir);

            // Check if there are changes to commit
            try {
                await this.execGit(['diff', '--cached', '--exit-code'], localDir);
                console.log(chalk.gray('No changes to commit'));
                return 0;
            } catch (error) {
                // Good - there are changes to commit
            }

            // Commit changes
            await this.execGit(['commit', '-m', message], localDir);
            console.log(chalk.green(`✓ Committed changes: ${message}`));

            return 0;
        } catch (error) {
            throw new Error(`Failed to commit: ${error.message}`);
        }
    }

    /**
   * Push changes to remote repository
   */
    async handlePush(parsed) {
        const addressStr = parsed.args[1];

        if (!addressStr) {
            throw new Error('Address is required: dot push user@remote:workspace');
        }

        const address = await this.parseAddress(addressStr);
        const localDir = this.getLocalDotfilesDir(address);
        const remoteId = `${address.userIdentifier}@${address.remote}`;
        const gitUrl = await this.buildGitUrl(address);
        const token = await this.getApiToken(remoteId);

        if (!existsSync(localDir)) {
            throw new Error(
                `Local dotfiles directory not found. Run: dot clone ${address.full}`,
            );
        }

        try {
            // Configure git credentials for this push
            const authUrl = gitUrl.replace('://', `://user:${token}@`);

            // Update remote URL
            await this.execGit(['remote', 'set-url', 'origin', authUrl], localDir);

            // Get current branch
            const { stdout: branchOutput } = await this.execGit(
                ['branch', '--show-current'],
                localDir,
            );
            const currentBranch = branchOutput.trim() || 'master';

            // Push changes
            console.log(chalk.blue(`Pushing to ${address.full}...`));
            try {
                await this.execGit(['push', 'origin', currentBranch], localDir);
                console.log(chalk.green('✓ Pushed changes successfully'));
            } catch (error) {
                if (error.message.includes('Everything up-to-date')) {
                    console.log(chalk.green('✓ Repository is up-to-date'));
                } else {
                    throw error;
                }
            }

            return 0;
        } catch (error) {
            throw new Error(`Failed to push: ${error.message}`);
        }
    }

    /**
   * Pull changes from remote repository
   */
    async handlePull(parsed) {
        const addressStr = parsed.args[1];

        if (!addressStr) {
            throw new Error('Address is required: dot pull user@remote:workspace');
        }

        const address = await this.parseAddress(addressStr);
        const localDir = this.getLocalDotfilesDir(address);
        const remoteId = `${address.userIdentifier}@${address.remote}`;
        const gitUrl = await this.buildGitUrl(address);
        const token = await this.getApiToken(remoteId);

        if (!existsSync(localDir)) {
            throw new Error(
                `Local dotfiles directory not found. Run: dot clone ${address.full}`,
            );
        }

        try {
            // Configure git credentials for this pull
            const authUrl = gitUrl.replace('://', `://user:${token}@`);

            // Update remote URL
            await this.execGit(['remote', 'set-url', 'origin', authUrl], localDir);

            // Get current branch
            const { stdout: branchOutput } = await this.execGit(
                ['branch', '--show-current'],
                localDir,
            );
            const currentBranch = branchOutput.trim() || 'master';

            // Pull changes
            console.log(chalk.blue(`Pulling from ${address.full}...`));
            await this.execGit(['pull', 'origin', currentBranch], localDir);

            console.log(chalk.green('✓ Pulled changes successfully'));

            return 0;
        } catch (error) {
            throw new Error(`Failed to pull: ${error.message}`);
        }
    }

    /**
   * Get status of dotfiles repository
   */
    async handleStatus(parsed) {
        const addressStr = parsed.args[1];

        if (!addressStr) {
            throw new Error('Address is required: dot status user@remote:workspace');
        }

        const address = await this.parseAddress(addressStr);
        const localDir = this.getLocalDotfilesDir(address);

        console.log(chalk.bold(`Status for ${address.full}:`));

        // Check local directory
        if (existsSync(localDir)) {
            console.log(chalk.green(`✓ Local directory: ${localDir}`));

            try {
                // Check git status
                const { stdout } = await this.execGit(
                    ['status', '--porcelain'],
                    localDir,
                );

                if (stdout.trim()) {
                    console.log(chalk.yellow('Local changes:'));
                    console.log(stdout);
                } else {
                    console.log(chalk.green('✓ Working directory clean'));
                }
            } catch (error) {
                console.log(chalk.red(`Git error: ${error.message}`));
            }
        } else {
            console.log(chalk.gray(`Local directory not found: ${localDir}`));
        }

        // Check remote status
        try {
            await this.checkConnection();

            // Get the API client for the specific remote
            const remoteId = `${address.userIdentifier}@${address.remote}`;
            const apiClient = await this.apiClient.getApiClient(remoteId);

            const response = await apiClient.client.get(
                `/workspaces/${address.resource}/dotfiles/status`,
            );

            if (response.data.status === 'success') {
                const status = response.data.payload;
                if (status.initialized) {
                    console.log(chalk.green('✓ Remote repository initialized'));
                    console.log(`Branches: ${status.branches?.join(', ') || 'none'}`);
                    if (status.currentBranch) {
                        console.log(`Current branch: ${status.currentBranch}`);
                    }
                } else {
                    console.log(chalk.gray('Remote repository not initialized'));
                }
            }
        } catch (error) {
            console.log(chalk.red(`Remote status error: ${error.message}`));
        }

        return 0;
    }

    /**
   * Activate dotfiles for a specific context (used by context set -u)
   */
    async handleActivateForContext(workspaceAddress, contextPath) {
        try {
            console.log(chalk.blue(`Updating dotfiles for context: ${contextPath}`));

            // Parse workspace address
            const address = await this.parseAddress(workspaceAddress);

                                    // Get dotfiles for the target context path
            let contextDotfiles = [];
            try {
                await this.checkConnection();

                // Get current context address
                const currentContextAddress = await this.getCurrentContext();

                // If we're switching to a different context path, we need to find/create the target context
                // For now, get all dotfiles from current context and filter by path
                // TODO: In the future, we should properly resolve context addresses for different paths
                const response = await this.apiClient.getDotfilesByContext(currentContextAddress);
                const result = response.payload || response.data || response;
                const allDotfiles = Array.isArray(result) ? result : [];

                // Filter dotfiles by context path
                const normalizedContextPath = contextPath === '/' ? '' : contextPath.replace(/^\/+/, '').replace(/\/+$/, '');
                if (normalizedContextPath) {
                    contextDotfiles = allDotfiles.filter(doc => {
                        const dotfileData = doc.data || doc;
                        const repoPath = dotfileData.repoPath;

                        // Check if dotfile belongs to this context path
                        return repoPath && (repoPath.includes(`/${normalizedContextPath}/`) ||
                               repoPath.endsWith(`/${normalizedContextPath}`));
                    });
                } else {
                    // Root context - include all dotfiles
                    contextDotfiles = allDotfiles;
                }

            } catch (err) {
                this.debug('Could not fetch context dotfiles:', err.message);
                console.log(chalk.yellow('Warning: Could not fetch dotfiles from database'));
                return 0;
            }

            if (contextDotfiles.length === 0) {
                console.log(chalk.gray(`No dotfiles found for context: ${contextPath}`));
                return 0;
            }

            // Load local index and workspace config
            const localIndex = await this.loadDotfilesIndex();
            const key = `${address.userIdentifier}@${address.remote}:${address.resource}`;
            const localDir = this.getLocalDotfilesDir(address);

            if (!existsSync(localDir)) {
                console.log(chalk.yellow(`Local dotfiles directory not found: ${localDir}`));
                console.log(chalk.blue(`Run: canvas dot clone ${workspaceAddress}`));
                return 0;
            }

            // Ensure workspace entry exists in local index
            if (!localIndex[key]) {
                localIndex[key] = {
                    path: localDir,
                    status: 'inactive',
                    files: []
                };
            }

            // Deactivate conflicting dotfiles from other contexts first
            const allActivatedFiles = new Set();
            for (const config of Object.values(localIndex)) {
                for (const file of config.files || []) {
                    if (file.active) {
                        allActivatedFiles.add(file.src);
                    }
                }
            }

            // Build map of context dotfiles
            const contextFileMap = new Map();
            for (const doc of contextDotfiles) {
                const dotfileData = doc.data || doc;
                const localPath = dotfileData.localPath;
                const displayRemote = dotfileData.repoPath;
                const docId = doc.id;

                // Extract relative path from repository
                const relativePath = dotfileData.repoPath;
                // Handle accidental duplicated context path segments (e.g., work/wipro/work/wipro/file)


                contextFileMap.set(localPath, {
                    src: localPath,
                    dst: relativePath,
                    docId,
                    priority: dotfileData.priority || 0,
                    remotePath: displayRemote,
                    type: 'file' // We'll determine this when activating
                });
            }

            // Deactivate any currently active files that conflict with context files
            let deactivatedCount = 0;
            for (const [config_key, config] of Object.entries(localIndex)) {
                for (const file of config.files || []) {
                    if (file.active && contextFileMap.has(file.src)) {
                        // Deactivate this file as it will be replaced by context version
                        try {
                            await this.deactivateFile(file, path.dirname(this.getLocalDotfilesDir(await this.parseAddress(config_key))));
                            file.active = false;
                            deactivatedCount++;
                        } catch (err) {
                            this.debug(`Failed to deactivate ${file.src}:`, err.message);
                        }
                    }
                }
            }

            if (deactivatedCount > 0) {
                console.log(chalk.yellow(`Deactivated ${deactivatedCount} conflicting dotfiles`));
            }

            // Activate context dotfiles
            let activatedCount = 0;
            const contextFiles = Array.from(contextFileMap.values()).sort((a, b) => b.priority - a.priority);

            for (const fileData of contextFiles) {
                try {
                    // Check if file exists in local dotfiles repo
                    const dotfilePath = path.join(localDir, fileData.dst);
                    if (!existsSync(dotfilePath)) {
                        console.log(chalk.yellow(`Skipping ${fileData.src}: dotfile not found at ${dotfilePath}`));
                        continue;
                    }

                    // Determine file type
                    try {
                        const stats = await fs.stat(dotfilePath);
                        fileData.type = stats.isDirectory() ? 'folder' : 'file';
                    } catch (err) {
                        fileData.type = 'file';
                    }

                    // Activate the file
                    await this.activateFile(fileData, localDir, fileData.docId);
                    fileData.active = true;
                    fileData.addedAt = new Date().toISOString();
                    activatedCount++;

                    // Add to local index if not already there
                    const existingFile = localIndex[key].files.find(f => f.src === fileData.src);
                    if (existingFile) {
                        Object.assign(existingFile, fileData);
                    } else {
                        localIndex[key].files.push(fileData);
                    }

                } catch (err) {
                    console.log(chalk.red(`Failed to activate ${fileData.src}: ${err.message}`));
                }
            }

            // Update local index
            if (activatedCount > 0) {
                localIndex[key].status = 'active';
            }
            await this.saveDotfilesIndex(localIndex);

            console.log(chalk.green(`✓ Activated ${activatedCount} dotfiles for context: ${contextPath}`));
            return 0;

        } catch (error) {
            throw new Error(`Failed to activate dotfiles for context: ${error.message}`);
        }
    }

    /**
   * Activate dotfiles (create symlinks)
   */
    async handleActivate(parsed) {
        const targetSpec = parsed.args[1];

        if (!targetSpec) {
            throw new Error(
                'Target is required: dot activate user@remote:workspace/file or dot activate user@remote:workspace',
            );
        }

        const address = await this.parseAddress(targetSpec);
        const index = await this.loadDotfilesIndex();
        const key = `${address.userIdentifier}@${address.remote}:${address.resource}`;

        if (!index[key]) {
            throw new Error(`Dotfiles not found for ${key}. Run: dot clone ${key}`);
        }

        const config = index[key];
        const localDir = this.getLocalDotfilesDir(address);

        if (!existsSync(localDir)) {
            throw new Error(`Local dotfiles directory not found: ${localDir}`);
        }

        try {
            // Fetch dotfiles from database to get document IDs
            let databaseDotfiles = [];
            let docIdMap = new Map(); // Map from localPath to docId

            try {
                await this.checkConnection();
                // Get current context to determine workspace
                const contextAddress = await this.getCurrentContext(this.options);
                const ctxResp = await this.apiClient.getContext(contextAddress);
                let ctx = ctxResp.payload || ctxResp.data || ctxResp;
                if (ctx && ctx.context) ctx = ctx.context;
                const workspaceId = ctx?.workspaceId;

                if (workspaceId) {
                    const response = await this.apiClient.getDotfilesByWorkspace(workspaceId);
                    const result = response.payload || response.data || response;
                    databaseDotfiles = Array.isArray(result) ? result : [];

                    // Build map from localPath to docId
                    for (const doc of databaseDotfiles) {
                        const dotfileData = doc.data || doc;
                        const localPath = dotfileData.localPath;
                        const docId = doc.id;
                        docIdMap.set(localPath, docId);
                    }
                }
            } catch (err) {
                this.debug('Could not fetch dotfiles from database:', err.message);
            }

            if (address.path) {
                // Activate specific file
                const targetFile = address.path.startsWith('/')
                    ? address.path.slice(1)
                    : address.path;
                const fileEntry = config.files.find((f) => f.dst === targetFile);

                if (!fileEntry) {
                    throw new Error(`File not found in index: ${targetFile}`);
                }

                const docId = docIdMap.get(fileEntry.src);
                await this.activateFile(fileEntry, localDir, docId);

                // Update index
                fileEntry.active = true;
                if (docId) {
                    fileEntry.docId = docId;
                }
                await this.saveDotfilesIndex(index);

                console.log(chalk.green(`✓ Activated ${fileEntry.src}`));
            } else {
                // Activate all files
                for (const fileEntry of config.files) {
                    const docId = docIdMap.get(fileEntry.src);
                    await this.activateFile(fileEntry, localDir, docId);
                    fileEntry.active = true;
                    if (docId) {
                        fileEntry.docId = docId;
                    }
                }

                config.status = 'active';
                await this.saveDotfilesIndex(index);

                console.log(chalk.green(`✓ Activated all dotfiles for ${key}`));
            }

            return 0;
        } catch (error) {
            throw new Error(`Failed to activate dotfiles: ${error.message}`);
        }
    }

    /**
   * Deactivate dotfiles (remove symlinks)
   */
    async handleDeactivate(parsed) {
        const targetSpec = parsed.args[1];

        if (!targetSpec) {
            throw new Error(
                'Target is required: dot deactivate user@remote:workspace/file or dot deactivate user@remote:workspace',
            );
        }

        const address = await this.parseAddress(targetSpec);
        const index = await this.loadDotfilesIndex();
        const key = `${address.userIdentifier}@${address.remote}:${address.resource}`;

        if (!index[key]) {
            throw new Error(`Dotfiles not found for ${key}`);
        }

        const config = index[key];
        const localDir = this.getLocalDotfilesDir(address);

        try {
            if (address.path) {
                // Deactivate specific file
                const targetFile = address.path.startsWith('/')
                    ? address.path.slice(1)
                    : address.path;
                const fileEntry = config.files.find((f) => f.dst === targetFile);

                if (!fileEntry) {
                    throw new Error(`File not found in index: ${targetFile}`);
                }

                await this.deactivateFile(fileEntry, localDir);

                // Update index
                fileEntry.active = false;
                await this.saveDotfilesIndex(index);

                console.log(chalk.green(`✓ Deactivated ${fileEntry.src}`));
            } else {
                // Deactivate all files
                for (const fileEntry of config.files) {
                    await this.deactivateFile(fileEntry, localDir);
                    fileEntry.active = false;
                }

                config.status = 'inactive';
                await this.saveDotfilesIndex(index);

                console.log(chalk.green(`✓ Deactivated all dotfiles for ${key}`));
            }

            return 0;
        } catch (error) {
            throw new Error(`Failed to deactivate dotfiles: ${error.message}`);
        }
    }

    /**
   * Change directory to dotfiles directory
   */
    async handleCd(parsed) {
        const addressStr = parsed.args[1];

        if (!addressStr) {
            throw new Error('Address is required: dot cd user@remote:workspace');
        }

        const address = await this.parseAddress(addressStr);
        const localDir = this.getLocalDotfilesDir(address);

        if (!existsSync(localDir)) {
            throw new Error(
                `Local dotfiles directory not found: ${localDir}. Run: dot clone ${address.full}`,
            );
        }

        // Output the directory path for shell to cd to
        console.log(localDir);
        return 0;
    }

    // Helper methods
    normalizeLocalPathInput(inputPath) {
        if (!inputPath) return inputPath;
        const home = os.homedir();
        let abs = inputPath;
        // Expand common home placeholders to absolute for checks
        abs = abs.replace(/^~(?=\/?|$)/, home);
        abs = abs.replace(/^\$HOME(?=\/?|$)/, home);
        abs = abs.replace(/^\{\{\s*HOME\s*\}\}(?=\/?|$)/, home);
        // Canonical store: if under home, use {{HOME}} prefix
        if (abs.startsWith(home + path.sep) || abs === home) {
            const rel = abs.slice(home.length).replace(/^\//, '');
            return rel ? `{{HOME}}/${rel}` : `{{HOME}}`;
        }
        return abs;
    }
    async ensureEncryptedIndexEntry(localDir, relPath) {
        const idxPath = path.join(localDir, '.dot', 'encrypted.index');
        await fs.mkdir(path.dirname(idxPath), { recursive: true });
        let content = '';
        try { content = await fs.readFile(idxPath, 'utf8'); } catch (_) {}
        const lines = content.split('\n').map((s) => s.trim()).filter(Boolean);
        if (!lines.includes(relPath)) {
            lines.push(relPath);
            await fs.writeFile(idxPath, lines.join('\n') + '\n');
        }
    }

    async removeEncryptedIndexEntry(localDir, relPath) {
        const idxPath = path.join(localDir, '.dot', 'encrypted.index');
        try {
            const content = await fs.readFile(idxPath, 'utf8');
            const lines = content.split('\n').map((s) => s.trim()).filter(Boolean);
            const filtered = lines.filter((l) => l !== relPath);
            await fs.writeFile(idxPath, filtered.join('\n') + (filtered.length ? '\n' : ''));
        } catch (_) {}
    }

    async ensureGitignoreIgnores(localDir, relPath) {
        const gi = path.join(localDir, '.gitignore');
        let content = '';
        try { content = await fs.readFile(gi, 'utf8'); } catch (_) {}
        const set = new Set(content.split('\n').map((s) => s.trim()).filter(Boolean));
        if (!set.has(relPath)) set.add(relPath);
        await fs.writeFile(gi, Array.from(set).join('\n') + '\n');
    }

    /**
   * Activate a single dotfile or folder (create symlink)
   */
    async activateFile(fileEntry, localDir, docId = null) {
        const srcPath = fileEntry.src.replace(/^~/, os.homedir());
        const dotfilePath = path.join(localDir, fileEntry.dst);

        if (!existsSync(dotfilePath)) {
            throw new Error(`Dotfile not found: ${dotfilePath}`);
        }

        // Check if target already exists
        if (existsSync(srcPath)) {
            // Create backup with document ID if available, otherwise fallback to timestamp
            const backupSuffix = docId ? `backup.${docId}` : `backup.${Date.now()}`;
            const backupPath = `${srcPath}.${backupSuffix}`;

            // If backup already exists with this docId, remove it first
            if (existsSync(backupPath)) {
                await fs.rm(backupPath, { recursive: true, force: true });
            }

            await this.execCommand('mv', [srcPath, backupPath]);
            const type = fileEntry.type === 'folder' ? 'folder' : 'file';
            console.log(chalk.yellow(`Backed up existing ${type} to: ${backupPath}`));

            // Update file entry with backup info
            fileEntry.backupPath = backupPath;
            fileEntry.backupCreatedAt = new Date().toISOString();
            if (docId) {
                fileEntry.docId = docId;
            }
        }

        // Create symlink (works for both files and directories)
        await fs.symlink(dotfilePath, srcPath);
    }

    /**
   * Deactivate a single dotfile or folder (remove symlink)
   */
    async deactivateFile(fileEntry, localDir) {
        const srcPath = fileEntry.src.replace(/^~/, os.homedir());
        const dotfilePath = path.join(localDir, fileEntry.dst);

        if (!existsSync(srcPath)) {
            return; // Already deactivated
        }

        // Check if it's a symlink to our dotfile/folder
        try {
            const stats = await fs.lstat(srcPath);
            if (stats.isSymbolicLink()) {
                const linkTarget = await fs.readlink(srcPath);
                if (path.resolve(linkTarget) === path.resolve(dotfilePath)) {
                    // Remove symlink and replace with copy
                    await fs.unlink(srcPath);

                    if (fileEntry.type === 'folder') {
                        // For folders, use cp -r to restore
                        await this.execCommand('cp', ['-r', dotfilePath, srcPath]);
                    } else {
                        // For files, use regular copy
                        await fs.copyFile(dotfilePath, srcPath);
                    }
                }
            }
        } catch (error) {
            console.warn(
                chalk.yellow(
                    `Warning: Could not deactivate ${srcPath}: ${error.message}`,
                ),
            );
        }
    }

    /**
   * Sync repository (clone if missing, push local commits, pull remote)
   */
    async handleSync(parsed) {
        const addressStr = parsed.args[1];
        if (!addressStr) {
            throw new Error('Address is required: dot sync user@remote:workspace');
        }
        const address = await this.parseAddress(addressStr);
        const localDir = this.getLocalDotfilesDir(address);

        // Clone if directory does not exist
        if (!existsSync(localDir)) {
            console.log(chalk.blue('Local repository not found – cloning...'));
            // Reuse clone logic
            return await this.handleClone({ ...parsed, args: ['clone', addressStr] });
        }
        // Commit any local changes
        await this.handleCommit({
            ...parsed,
            args: ['commit', addressStr, 'Sync local changes'],
        });
        // Push and pull
        await this.handlePush({ ...parsed, args: ['push', addressStr] });
        await this.handlePull({ ...parsed, args: ['pull', addressStr] });
        return 0;
    }

    /**
   * Restore original file/folder from backup created during activation
   */
    async handleRestore(parsed) {
        const targetSpec = parsed.args[1];
        if (!targetSpec) {
            throw new Error(
                'Target is required: dot restore user@remote:workspace/file or dot restore user@remote:workspace',
            );
        }
        const address = await this.parseAddress(targetSpec);
        const index = await this.loadDotfilesIndex();
        const key = `${address.userIdentifier}@${address.remote}:${address.resource}`;
        const config = index[key];
        if (!config) {
            throw new Error(`Dotfiles not found for ${key}`);
        }
        const localDir = this.getLocalDotfilesDir(address);

        const restoreEntry = async (fileEntry) => {
            const srcPath = fileEntry.src.replace(/^~/, os.homedir());
            const backups = [
                `${srcPath}.backup`,
                ...(await fs.readdir(path.dirname(srcPath))).filter((f) =>
                    f.startsWith(path.basename(srcPath) + '.backup'),
                ),
            ];
            if (backups.length === 0) {
                console.log(chalk.gray(`No backup found for ${srcPath}`));
                return;
            }
            const latestBackup = backups.sort().pop();
            await this.execCommand('mv', [
                path.join(path.dirname(srcPath), latestBackup),
                srcPath,
            ]);
            console.log(chalk.green(`✓ Restored ${srcPath} from backup`));
        };

        if (address.path) {
            const targetFile = address.path.startsWith('/')
                ? address.path.slice(1)
                : address.path;
            const fileEntry = config.files.find((f) => f.dst === targetFile);
            if (!fileEntry) {
                throw new Error(`File not found in index: ${targetFile}`);
            }
            await restoreEntry(fileEntry);
        } else {
            for (const fileEntry of config.files) {
                await restoreEntry(fileEntry);
            }
        }
        return 0;
    }

    /**
    * Remove a dotfile document from a specific context (unlink only)
    * Usage: dot remove <workspace/repoPath> --context context/path
    */
    async handleRemove(parsed) {
        const targetSpec = parsed.args[1];
        const contextPathOpt = this.options?.context;
        if (!targetSpec) {
            throw new Error('Target is required: dot remove user@remote:workspace/path --context context/path');
        }
        if (!contextPathOpt) {
            throw new Error('Context is required: use --context context/path');
        }

        const address = await this.parseAddress(targetSpec);
        const repoPath = address.path.startsWith('/') ? address.path.slice(1) : address.path;
        if (!repoPath) throw new Error('Repository path is required in target');

        // Build context address from workspace + context path
        const normalizedContextPath = contextPathOpt.replace(/^\/+/, '').replace(/\/+$/, '');
        const workspaceAddress = `${address.userIdentifier}@${address.remote}:${address.resource}`;
        // Find the document in that context by repoPath
        const response = await this.apiClient.getDotfilesByContext(`${workspaceAddress}/${normalizedContextPath}`);
        const docs = response.payload || response.data || response;
        const match = (Array.isArray(docs) ? docs : []).find((doc) => {
            const d = doc.data || doc;
            return d.repoPath === repoPath;
        });
        if (!match) {
            throw new Error(`Dotfile not found in context '${normalizedContextPath}': ${repoPath}`);
        }

        // Remove via workspace route with contextSpec
        await this.apiClient.removeDocument(workspaceAddress, match.id, 'workspace', `/${normalizedContextPath}`);
        console.log(chalk.green(`✓ Removed from context ${normalizedContextPath}: ${repoPath}`));
        return 0;
    }

    /**
    * Delete a dotfile from the repository and delete its document from the workspace
    */
    async handleDelete(parsed) {
        const targetSpec = parsed.args[1];
        if (!targetSpec) {
            throw new Error('Target is required: dot delete user@remote:workspace/path');
        }
        const address = await this.parseAddress(targetSpec);
        const repoPath = address.path.startsWith('/') ? address.path.slice(1) : address.path;
        if (!repoPath) throw new Error('Repository path is required in target');

        // Find document by repoPath in workspace
        const workspaceAddress = `${address.userIdentifier}@${address.remote}:${address.resource}`;
        const resp = await this.apiClient.getDotfilesByWorkspace(workspaceAddress);
        const docs = resp.payload || resp.data || resp;
        const match = (Array.isArray(docs) ? docs : []).find((doc) => {
            const d = doc.data || doc;
            return d.repoPath === repoPath;
        });
        if (!match) {
            throw new Error(`Dotfile document not found in workspace: ${repoPath}`);
        }

        // Delete from local repository if present
        const localDir = this.getLocalDotfilesDir(address);
        if (existsSync(localDir)) {
            const targetPath = path.join(localDir, repoPath);
            try {
                await fs.rm(targetPath, { recursive: true, force: true });
                // Update encryption index
                await this.removeEncryptedIndexEntry(localDir, repoPath);
                // Commit & push
                await this.execGit(['add', '-A'], localDir);
                await this.execGit(['commit', '-m', `Remove dotfile ${repoPath}`], localDir);
                await this.handlePush({ ...parsed, args: ['push', workspaceAddress] });
            } catch (e) {
                console.log(chalk.yellow(`Warning: could not update repository: ${e.message}`));
            }
        } else {
            console.log(chalk.gray('Local repository not found; deleting document only'));
        }

        // Delete document from workspace
        await this.apiClient.deleteDocument(workspaceAddress, match.id, 'workspace');
        console.log(chalk.green(`✓ Deleted dotfile and document: ${repoPath}`));
        return 0;
    }

    /**
    * Install repository hooks (.dot/install-hooks.sh)
    */
    async handleInstallHooks(parsed) {
        const addressStr = parsed.args[1];
        if (!addressStr) {
            throw new Error('Address is required: dot install-hooks user@remote:workspace');
        }
        const address = await this.parseAddress(addressStr);
        const localDir = this.getLocalDotfilesDir(address);
        if (!existsSync(localDir)) {
            throw new Error(`Local dotfiles directory not found: ${localDir}. Run: dot clone ${address.full}`);
        }
        const args = ['.dot/install-hooks.sh'];
        if (this.options && (this.options.force === true || this.options.f === true)) {
            args.push('--force');
        }
        await this.execCommand('bash', args, localDir);
        console.log(chalk.green('✓ Hooks installed'));
        return 0;
    }

    /**
    * Mark a file for encryption (update .dot/encrypted.index and .gitignore)
    */
    async handleEncrypt(parsed) {
        const targetSpec = parsed.args[1];
        if (!targetSpec) {
            throw new Error('Target is required: dot encrypt user@remote:workspace/path');
        }
        const address = await this.parseAddress(targetSpec);
        const localDir = this.getLocalDotfilesDir(address);
        if (!existsSync(localDir)) {
            throw new Error(`Local dotfiles directory not found: ${localDir}`);
        }
        const relPath = address.path.startsWith('/') ? address.path.slice(1) : address.path;
        if (!relPath) throw new Error('Path is required');
        await this.ensureEncryptedIndexEntry(localDir, relPath);
        await this.ensureGitignoreIgnores(localDir, relPath);
        console.log(chalk.green(`✓ Marked for encryption: ${relPath}`));
        return 0;
    }

    /**
    * Unmark a file from encryption (update .dot/encrypted.index). Keeps .gitignore rule.
    */
    async handleDecrypt(parsed) {
        const targetSpec = parsed.args[1];
        if (!targetSpec) {
            throw new Error('Target is required: dot decrypt user@remote:workspace/path');
        }
        const address = await this.parseAddress(targetSpec);
        const localDir = this.getLocalDotfilesDir(address);
        if (!existsSync(localDir)) {
            throw new Error(`Local dotfiles directory not found: ${localDir}`);
        }
        const relPath = address.path.startsWith('/') ? address.path.slice(1) : address.path;
        if (!relPath) throw new Error('Path is required');
        await this.removeEncryptedIndexEntry(localDir, relPath);
        console.log(chalk.green(`✓ Unmarked for encryption: ${relPath}`));
        return 0;
    }

    /**
   * Show help for the dot command
   */
    showHelp() {
        console.log(chalk.bold('Canvas Dotfile Manager'));
        console.log('');
        console.log(chalk.underline('Usage:'));
        console.log('  dot <command> [arguments]');
        console.log('');
        console.log(chalk.underline('Commands:'));
        console.log('  list                                 List all dotfiles');
        console.log(
            '  init <user@remote:workspace>         Initialize remote repository',
        );
        console.log(
            '  sync <user@remote:workspace>         Sync repository (clone if missing, push & pull otherwise)',
        );
        console.log(
            '  add <src> <workspace/dest> [--context path] [--encrypt]  Add dotfile/folder; bind to context; mark for encryption',
        );
        console.log('  commit <workspace> [message]         Commit changes');
        console.log(
            '  push <workspace>                     Push changes to remote',
        );
        console.log(
            '  pull <workspace>                     Pull changes from remote',
        );
        console.log(
            '  status <workspace>                   Show repository status',
        );
        console.log(
            '  activate <workspace>[/file]          Activate dotfiles (create symlinks)',
        );
        console.log(
            '  deactivate <workspace>[/file]        Deactivate dotfiles (remove symlinks)\n  restore <workspace>[/file]           Restore backup of original file/folder',
        );
        console.log('  encrypt <workspace/path>             Mark a path for encryption');
        console.log('  decrypt <workspace/path>             Unmark a path for encryption');
        console.log('  remove <workspace/path> --context p  Remove dotfile document from a context');
        console.log('  delete <workspace/path>              Delete from repo and remove document');
        console.log('  install-hooks <workspace>            Install local git hooks for encryption/decryption');
        console.log(
            '  cd <workspace>                       Get dotfiles directory path',
        );
        console.log('');
        console.log(chalk.underline('Address Formats:'));
        console.log('  user@remote:workspace                Full address');
        console.log(
            '  workspace                            Use current session remote',
        );
        console.log(
            '  workspace/path                       Specify path within workspace',
        );
        console.log('');
        console.log(chalk.underline('Examples:'));
        console.log('  dot init john@mycanvas:work');
        console.log('  dot clone john@mycanvas:work');
        console.log('  dot add ~/.bashrc work/bashrc');
        console.log('  dot add ~/.config/nvim work/nvim');
        console.log('  dot activate john@mycanvas:work/bashrc');
        console.log('  dot list');
    }
}

export default DotCommand;

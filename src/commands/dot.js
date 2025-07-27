'use strict';

import chalk from 'chalk';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import BaseCommand from './base.js';
import { parseResourceAddress } from '../utils/address-parser.js';

/**
 * Constants
 */
const CANVAS_HOME = process.env.CANVAS_USER_HOME || path.join(os.homedir(), '.canvas');
const DOTFILES_CONFIG_FILE = path.join(CANVAS_HOME, 'config', 'dotfiles.json');

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
            throw new Error('No remote bound. Use full address format user@remote:workspace or bind a remote with: canvas remote bind <user@remote>');
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
            resourceType: 'workspace'
        };
    }

    /**
     * Get local dotfiles directory for an address
     */
    getLocalDotfilesDir(address) {
        const remoteKey = `${address.userIdentifier}@${address.remote}`;
        return path.join(CANVAS_HOME, remoteKey, address.resource, 'dotfiles');
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
            console.warn(chalk.yellow('Warning: Could not load dotfiles index, using empty index'));
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
                files: []
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
                stdio: ['pipe', 'pipe', 'pipe']
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
    async getApiToken() {
        // Try to get token from config or session
        const session = await this.apiClient.remoteStore.getSession();
        if (session.token) {
            return session.token;
        }

        // Fallback to config token
        return this.config.get('server.auth.token');
    }

    /**
     * Build git URL for Canvas dotfiles repository
     */
    async buildGitUrl(address) {
        const token = await this.getApiToken();
        if (!token) {
            throw new Error('No authentication token available');
        }

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
        const index = await this.loadDotfilesIndex();

        if (Object.keys(index).length === 0) {
            console.log(chalk.gray('No dotfiles configured'));
            return 0;
        }

        console.log(chalk.bold('Dotfiles:'));
        for (const [key, config] of Object.entries(index)) {
            const status = config.status === 'active' ? chalk.green('●') : chalk.gray('○');
            console.log(`${status} ${chalk.cyan(key)}`);

            if (config.files && config.files.length > 0) {
                for (const file of config.files) {
                    const fileStatus = file.active ? chalk.green('  ●') : chalk.gray('  ○');
                    console.log(`${fileStatus} ${file.src} → ${file.dst}`);
                }
            }
        }

        return 0;
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

            const response = await this.apiClient.client.post(`/workspaces/${address.resource}/dotfiles/init`);

            if (response.data.status === 'success') {
                console.log(chalk.green(`✓ Dotfiles repository initialized for ${address.full}`));

                // Update index
                await this.updateIndexEntry(address, {
                    status: 'initialized'
                });

                return 0;
            } else {
                throw new Error(response.data.message || 'Failed to initialize repository');
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
        const gitUrl = await this.buildGitUrl(address);
        const token = await this.getApiToken();

        // Create authenticated URL
        const authUrl = gitUrl.replace('://', `://user:${token}@`);

        try {
            // Create parent directory
            await fs.mkdir(path.dirname(localDir), { recursive: true });

            // Clone repository
            console.log(chalk.blue(`Cloning ${address.full}...`));
            await this.execGit(['clone', authUrl, localDir]);

            console.log(chalk.green(`✓ Cloned to ${localDir}`));

            // Update index
            await this.updateIndexEntry(address, {
                status: 'cloned',
                clonedAt: new Date().toISOString()
            });

            return 0;
        } catch (error) {
            throw new Error(`Failed to clone repository: ${error.message}`);
        }
    }

    /**
     * Add dotfile to repository
     */
    async handleAdd(parsed) {
        const srcPath = parsed.args[1];
        const targetSpec = parsed.args[2];

        if (!srcPath || !targetSpec) {
            throw new Error('Usage: dot add <source-path> <user@remote:workspace/destination> or dot add <source-path> <workspace/destination>');
        }

        const address = await this.parseAddress(targetSpec);
        const localDir = this.getLocalDotfilesDir(address);

        if (!existsSync(localDir)) {
            throw new Error(`Local dotfiles directory not found. Run: dot clone ${address.full}`);
        }

        // Extract destination path from address
        const destPath = address.path.startsWith('/') ? address.path.slice(1) : address.path;
        if (!destPath) {
            throw new Error('Destination path is required');
        }

        const expandedSrcPath = srcPath.replace(/^~/, os.homedir());
        const destFilePath = path.join(localDir, destPath);

        if (!existsSync(expandedSrcPath)) {
            throw new Error(`Source file not found: ${expandedSrcPath}`);
        }

        try {
            // Create destination directory if needed
            await fs.mkdir(path.dirname(destFilePath), { recursive: true });

            // Copy file
            await fs.copyFile(expandedSrcPath, destFilePath);
            console.log(chalk.green(`✓ Added ${srcPath} → ${destPath}`));

            // Update index
            const index = await this.loadDotfilesIndex();
            const key = `${address.userIdentifier}@${address.remote}:${address.resource}`;

            if (!index[key]) {
                index[key] = { path: localDir, status: 'inactive', files: [] };
            }

            // Remove existing entry for this source
            index[key].files = index[key].files.filter(f => f.src !== srcPath);

            // Add new entry
            index[key].files.push({
                src: srcPath,
                dst: destPath,
                active: false,
                addedAt: new Date().toISOString()
            });

            await this.saveDotfilesIndex(index);

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
            throw new Error('Address is required: dot commit user@remote:workspace [message]');
        }

        const address = await this.parseAddress(addressStr);
        const localDir = this.getLocalDotfilesDir(address);

        if (!existsSync(localDir)) {
            throw new Error(`Local dotfiles directory not found. Run: dot clone ${address.full}`);
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
        const gitUrl = await this.buildGitUrl(address);
        const token = await this.getApiToken();

        if (!existsSync(localDir)) {
            throw new Error(`Local dotfiles directory not found. Run: dot clone ${address.full}`);
        }

        try {
            // Configure git credentials for this push
            const authUrl = gitUrl.replace('://', `://user:${token}@`);

            // Update remote URL
            await this.execGit(['remote', 'set-url', 'origin', authUrl], localDir);

            // Push changes
            console.log(chalk.blue(`Pushing to ${address.full}...`));
            await this.execGit(['push', 'origin', 'main'], localDir);

            console.log(chalk.green('✓ Pushed changes successfully'));

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
        const gitUrl = await this.buildGitUrl(address);
        const token = await this.getApiToken();

        if (!existsSync(localDir)) {
            throw new Error(`Local dotfiles directory not found. Run: dot clone ${address.full}`);
        }

        try {
            // Configure git credentials for this pull
            const authUrl = gitUrl.replace('://', `://user:${token}@`);

            // Update remote URL
            await this.execGit(['remote', 'set-url', 'origin', authUrl], localDir);

            // Pull changes
            console.log(chalk.blue(`Pulling from ${address.full}...`));
            await this.execGit(['pull', 'origin', 'main'], localDir);

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
                const { stdout } = await this.execGit(['status', '--porcelain'], localDir);

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

            const response = await this.apiClient.client.get(`/workspaces/${address.resource}/dotfiles/status`);

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
     * Activate dotfiles (create symlinks)
     */
    async handleActivate(parsed) {
        const targetSpec = parsed.args[1];

        if (!targetSpec) {
            throw new Error('Target is required: dot activate user@remote:workspace/file or dot activate user@remote:workspace');
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
            if (address.path) {
                // Activate specific file
                const targetFile = address.path.startsWith('/') ? address.path.slice(1) : address.path;
                const fileEntry = config.files.find(f => f.dst === targetFile);

                if (!fileEntry) {
                    throw new Error(`File not found in index: ${targetFile}`);
                }

                await this.activateFile(fileEntry, localDir);

                // Update index
                fileEntry.active = true;
                await this.saveDotfilesIndex(index);

                console.log(chalk.green(`✓ Activated ${fileEntry.src}`));
            } else {
                // Activate all files
                for (const fileEntry of config.files) {
                    await this.activateFile(fileEntry, localDir);
                    fileEntry.active = true;
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
            throw new Error('Target is required: dot deactivate user@remote:workspace/file or dot deactivate user@remote:workspace');
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
                const targetFile = address.path.startsWith('/') ? address.path.slice(1) : address.path;
                const fileEntry = config.files.find(f => f.dst === targetFile);

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
            throw new Error(`Local dotfiles directory not found: ${localDir}. Run: dot clone ${address.full}`);
        }

        // Output the directory path for shell to cd to
        console.log(localDir);
        return 0;
    }

    // Helper methods

    /**
     * Activate a single dotfile (create symlink)
     */
    async activateFile(fileEntry, localDir) {
        const srcPath = fileEntry.src.replace(/^~/, os.homedir());
        const dotfilePath = path.join(localDir, fileEntry.dst);

        if (!existsSync(dotfilePath)) {
            throw new Error(`Dotfile not found: ${dotfilePath}`);
        }

        // Check if target already exists
        if (existsSync(srcPath)) {
            // Create backup
            const backupPath = `${srcPath}.backup.${Date.now()}`;
            await fs.rename(srcPath, backupPath);
            console.log(chalk.yellow(`Backed up existing file to: ${backupPath}`));
        }

        // Create symlink
        await fs.symlink(dotfilePath, srcPath);
    }

    /**
     * Deactivate a single dotfile (remove symlink)
     */
    async deactivateFile(fileEntry, localDir) {
        const srcPath = fileEntry.src.replace(/^~/, os.homedir());
        const dotfilePath = path.join(localDir, fileEntry.dst);

        if (!existsSync(srcPath)) {
            return; // Already deactivated
        }

        // Check if it's a symlink to our dotfile
        try {
            const stats = await fs.lstat(srcPath);
            if (stats.isSymbolicLink()) {
                const linkTarget = await fs.readlink(srcPath);
                if (path.resolve(linkTarget) === path.resolve(dotfilePath)) {
                    // Remove symlink and replace with file content
                    await fs.unlink(srcPath);
                    await fs.copyFile(dotfilePath, srcPath);
                }
            }
        } catch (error) {
            console.warn(chalk.yellow(`Warning: Could not deactivate ${srcPath}: ${error.message}`));
        }
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
        console.log('  init <user@remote:workspace>         Initialize remote repository');
        console.log('  clone <user@remote:workspace>        Clone repository locally');
        console.log('  add <src> <workspace/dest>           Add dotfile to repository');
        console.log('  commit <workspace> [message]         Commit changes');
        console.log('  push <workspace>                     Push changes to remote');
        console.log('  pull <workspace>                     Pull changes from remote');
        console.log('  status <workspace>                   Show repository status');
        console.log('  activate <workspace>[/file]          Activate dotfiles (create symlinks)');
        console.log('  deactivate <workspace>[/file]        Deactivate dotfiles (remove symlinks)');
        console.log('  cd <workspace>                       Get dotfiles directory path');
        console.log('');
        console.log(chalk.underline('Address Formats:'));
        console.log('  user@remote:workspace                Full address');
        console.log('  workspace                            Use current session remote');
        console.log('  workspace/path                       Specify path within workspace');
        console.log('');
        console.log(chalk.underline('Examples:'));
        console.log('  dot init john@mycanvas:work');
        console.log('  dot clone john@mycanvas:work');
        console.log('  dot add ~/.bashrc work/bashrc');
        console.log('  dot activate john@mycanvas:work/bashrc');
        console.log('  dot list');
    }
}

export default DotCommand;

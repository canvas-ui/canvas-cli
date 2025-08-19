'use strict';

import chalk from 'chalk';
import BaseCommand from './base.js';

/**
 * Workspace command
 */
export class WorkspaceCommand extends BaseCommand {
    constructor(config) {
        super(config);
        this.options = null; // Will be set during execution
    }

    async execute(parsed) {
        try {
            this.options = parsed.options;

            // Collect client context for this execution
            this.collectClientContext();

            // Skip connection check for list action since we use cached data
            const action = parsed.args[0] || 'list';
            if (action !== 'list') {
                // Check if server is reachable for non-list actions
                await this.checkConnection();
            }

            // If no arguments, default to list
            if (parsed.args.length === 0) {
                return await this.handleList(parsed);
            }

            const firstArg = parsed.args[0];
            const secondArg = parsed.args[1];

            // Check if first arg is a known action
            const knownActions = [
                'list',
                'show',
                'create',
                'update',
                'delete',
                'start',
                'stop',
                'open',
                'close',
                'status',
                'documents',
                'document',
                'tabs',
                'notes',
                'tree',
                'current',
                'help',
            ];

            if (knownActions.includes(firstArg)) {
                // Route to appropriate action
                const action = firstArg;
                const methodName = `handle${action.charAt(0).toUpperCase() + action.slice(1)}`;

                if (typeof this[methodName] === 'function') {
                    return await this[methodName](parsed);
                } else {
                    console.error(chalk.red(`Unknown action: ${action}`));
                    this.showHelp();
                    return 1;
                }
            } else {
                // First arg is workspace ID, second arg is action
                const workspaceId = firstArg;
                const action = secondArg || 'show'; // default to show if no action specified

                // Create modified parsed object with workspace ID in correct position
                const modifiedParsed = {
                    ...parsed,
                    args: [action, workspaceId, ...parsed.args.slice(2)],
                };

                const methodName = `handle${action.charAt(0).toUpperCase() + action.slice(1)}`;

                if (typeof this[methodName] === 'function') {
                    return await this[methodName](modifiedParsed);
                } else {
                    console.error(chalk.red(`Unknown action: ${action}`));
                    this.showHelp();
                    return 1;
                }
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
   * List all workspaces
   */
    async handleList(parsed) {
        try {
            // Try to fetch from remote first while updating local index
            let remoteUpdateSuccess = false;
            try {
                const remoteId = await this.apiClient.getCurrentRemote();
                if (remoteId && await this.apiClient.isRemoteReachable(remoteId)) {
                    this.debug('Remote is reachable, updating local index...');
                    remoteUpdateSuccess = await this.apiClient.syncRemoteAndUpdateIndex(remoteId, {
                        contexts: false,
                        workspaces: true,
                        silent: true
                    });
                    if (remoteUpdateSuccess) {
                        this.debug('Local index updated successfully');
                    }
                }
            } catch (remoteError) {
                this.debug('Failed to update from remote:', remoteError.message);
                // Continue with local cache fallback
            }

            // Use cached workspaces from local storage (which may have been just updated)
            const cachedWorkspaces = await this.apiClient.getCachedWorkspaces();

            // Transform cached data to include remote information
            const workspaces = [];
            for (const [key, workspace] of Object.entries(cachedWorkspaces)) {
                // Parse key format: remoteId:workspaceId
                const [remoteId, workspaceId] = key.includes(':')
                    ? key.split(':', 2)
                    : ['local', key];

                workspaces.push({
                    address: remoteId, // Show full remote identifier as address
                    id: workspaceId,
                    ...workspace,
                });
            }

            // Sort by address, then by name
            workspaces.sort((a, b) => {
                if (a.address !== b.address) {
                    return a.address.localeCompare(b.address);
                }
                return (a.name || a.label || '').localeCompare(b.name || b.label || '');
            });

            // Update session with current workspace information if we have a bound context
            try {
                const session = await this.apiClient.remoteStore.getSession();
                if (session.boundContext) {
                    // Get the workspace from the bound context
                    const contextResponse = await this.apiClient.getContext(
                        session.boundContext,
                    );
                    const context =
            contextResponse.payload || contextResponse.data || contextResponse;

                    if (context && context.url) {
                        const workspaceName = context.url.split('://')[0] || 'universe';
                        // Find the workspace in our list that matches the current workspace
                        const currentWorkspace = workspaces.find(
                            (w) =>
                                w.label === workspaceName ||
                w.name === workspaceName ||
                w.id === workspaceName,
                        );
                        if (currentWorkspace) {
                            await this.apiClient.remoteStore.updateSession({
                                defaultWorkspace: `${currentWorkspace.address}:${currentWorkspace.id}`,
                            });
                        }
                    }
                }
            } catch (error) {
                // Ignore errors when updating session - this is not critical
                this.debug(
                    'Failed to update session with workspace info:',
                    error.message,
                );
            }

            await this.output(workspaces, 'workspace');
            return 0;
        } catch (error) {
            throw new Error(`Failed to list workspaces: ${error.message}`);
        }
    }

    /**
   * Show workspace details
   */
    async handleShow(parsed) {
        const workspaceAddress = parsed.args[1];
        if (!workspaceAddress) {
            throw new Error(
                'Workspace address is required (format: user@remote:workspace or just workspace if default remote is bound)',
            );
        }

        try {
            const response = await this.apiClient.getWorkspace(workspaceAddress);

            // Handle ResponseObject format
            let workspace = response.payload || response.data || response;

            // Extract workspace from nested response if needed
            if (workspace && workspace.workspace) {
                workspace = workspace.workspace;
            }

            await this.output(workspace, 'workspace');
            return 0;
        } catch (error) {
            throw new Error(`Failed to show workspace: ${error.message}`);
        }
    }

    /**
   * Create new workspace
   */
    async handleCreate(parsed) {
        const name = parsed.args[1];
        if (!name) {
            throw new Error('Workspace name is required');
        }

        const workspaceData = {
            name: name,
            label: parsed.options.label || name,
            description: parsed.options.description || '',
            type: parsed.options.type || 'workspace',
            color: parsed.options.color,
            metadata: parsed.options.metadata
                ? JSON.parse(parsed.options.metadata)
                : {},
        };

        try {
            // Create on current default remote
            const response = await this.apiClient.createWorkspace(workspaceData);

            // Handle ResponseObject format
            const workspace = response.payload || response.data || response;

            console.log(chalk.green(`✓ Workspace '${name}' created successfully`));
            await this.output(workspace, 'workspace');
            return 0;
        } catch (error) {
            throw new Error(`Failed to create workspace: ${error.message}`);
        }
    }

    /**
   * Update workspace
   */
    async handleUpdate(parsed) {
        const workspaceAddress = parsed.args[1];
        if (!workspaceAddress) {
            throw new Error(
                'Workspace address is required (format: user@remote:workspace or just workspace if default remote is bound)',
            );
        }

        const updateData = {};
        if (parsed.options.label) updateData.label = parsed.options.label;
        if (parsed.options.description)
            updateData.description = parsed.options.description;
        if (parsed.options.color) updateData.color = parsed.options.color;
        if (parsed.options.metadata)
            updateData.metadata = JSON.parse(parsed.options.metadata);

        if (Object.keys(updateData).length === 0) {
            throw new Error(
                'No update data provided. Use --label, --description, --color, or --metadata',
            );
        }

        try {
            const response = await this.apiClient.updateWorkspace(
                workspaceAddress,
                updateData,
            );

            // Handle ResponseObject format
            const workspace = response.payload || response.data || response;

            console.log(
                chalk.green(`✓ Workspace '${workspaceAddress}' updated successfully`),
            );
            await this.output(workspace, 'workspace');
            return 0;
        } catch (error) {
            throw new Error(`Failed to update workspace: ${error.message}`);
        }
    }

    /**
   * Delete workspace
   */
    async handleDelete(parsed) {
        const workspaceAddress = parsed.args[1];
        if (!workspaceAddress) {
            throw new Error(
                'Workspace address is required (format: user@remote:workspace or just workspace if default remote is bound)',
            );
        }

        if (!parsed.options.force) {
            console.log(
                chalk.yellow(
                    `Warning: This will permanently delete workspace '${workspaceAddress}' and all its data.`,
                ),
            );
            console.log(chalk.yellow('Use --force to confirm deletion.'));
            return 1;
        }

        try {
            await this.apiClient.deleteWorkspace(workspaceAddress);
            console.log(
                chalk.green(`✓ Workspace '${workspaceAddress}' deleted successfully`),
            );
            return 0;
        } catch (error) {
            throw new Error(`Failed to delete workspace: ${error.message}`);
        }
    }

    /**
   * Start workspace
   */
    async handleStart(parsed) {
        const workspaceAddress = parsed.args[1];
        if (!workspaceAddress) {
            throw new Error(
                'Workspace address is required (format: user@remote:workspace or just workspace if default remote is bound)',
            );
        }

        try {
            const response = await this.apiClient.startWorkspace(workspaceAddress);

            // Handle ResponseObject format
            const workspace = response.payload || response.data || response;

            console.log(
                chalk.green(`✓ Workspace '${workspaceAddress}' started successfully`),
            );
            await this.output(workspace, 'workspace');
            return 0;
        } catch (error) {
            throw new Error(`Failed to start workspace: ${error.message}`);
        }
    }

    /**
   * Stop workspace
   */
    async handleStop(parsed) {
        const workspaceAddress = parsed.args[1];
        if (!workspaceAddress) {
            throw new Error(
                'Workspace address is required (format: user@remote:workspace or just workspace if default remote is bound)',
            );
        }

        try {
            const response = await this.apiClient.stopWorkspace(workspaceAddress);

            // Handle ResponseObject format
            const result = response.payload || response.data || response;

            console.log(
                chalk.green(`✓ Workspace '${workspaceAddress}' stopped successfully`),
            );
            return 0;
        } catch (error) {
            throw new Error(`Failed to stop workspace: ${error.message}`);
        }
    }

    /**
   * Open workspace
   */
    async handleOpen(parsed) {
        const workspaceId = parsed.args[1];
        if (!workspaceId) {
            throw new Error('Workspace ID is required');
        }

        try {
            const response = await this.apiClient.openWorkspace(workspaceId);

            // Handle ResponseObject format
            const workspace = response.payload || response.data || response;

            console.log(
                chalk.green(`✓ Workspace '${workspaceId}' opened successfully`),
            );
            await this.output(workspace, 'workspace');
            return 0;
        } catch (error) {
            throw new Error(`Failed to open workspace: ${error.message}`);
        }
    }

    /**
   * Close workspace
   */
    async handleClose(parsed) {
        const workspaceId = parsed.args[1];
        if (!workspaceId) {
            throw new Error('Workspace ID is required');
        }

        try {
            const response = await this.apiClient.closeWorkspace(workspaceId);

            // Handle ResponseObject format
            const workspace = response.payload || response.data || response;

            console.log(
                chalk.green(`✓ Workspace '${workspaceId}' closed successfully`),
            );
            await this.output(workspace, 'workspace');
            return 0;
        } catch (error) {
            throw new Error(`Failed to close workspace: ${error.message}`);
        }
    }

    /**
   * Show workspace status
   */
    async handleStatus(parsed) {
        const workspaceId = parsed.args[1];
        if (!workspaceId) {
            throw new Error('Workspace ID is required');
        }

        try {
            const response = await this.apiClient.getWorkspaceStatus(workspaceId);

            // Handle ResponseObject format
            const statusData = response.payload || response.data || response;

            console.log(chalk.bold(`Workspace Status: ${workspaceId}`));
            console.log(`Status: ${statusData.status}`);
            return 0;
        } catch (error) {
            throw new Error(`Failed to get workspace status: ${error.message}`);
        }
    }

    /**
   * List all documents in workspace
   */
    async handleDocuments(parsed) {
        const workspaceAddress = parsed.args[1];
        if (!workspaceAddress) {
            throw new Error(
                'Workspace address is required (format: user@remote:workspace or just workspace if default remote is bound)',
            );
        }

        try {
            const response = await this.apiClient.getDocuments(
                workspaceAddress,
                'workspace',
            );

            // Handle ResponseObject format
            const documents = response.payload || response.data || response;

            await this.output(documents, 'document');
            return 0;
        } catch (error) {
            throw new Error(`Failed to list documents: ${error.message}`);
        }
    }

    /**
   * List tabs in workspace
   */
    async handleTabs(parsed) {
        const workspaceId = parsed.args[1];
        if (!workspaceId) {
            throw new Error('Workspace ID is required');
        }

        try {
            const options = {
                featureArray: ['data/abstraction/tab'],
            };
            const response = await this.apiClient.getDocuments(
                workspaceId,
                'workspace',
                options,
            );

            // Handle ResponseObject format
            const tabs = response.payload || response.data || response;

            await this.output(tabs, 'document', 'tab');
            return 0;
        } catch (error) {
            throw new Error(`Failed to list tabs: ${error.message}`);
        }
    }

    /**
   * Handle document commands
   */
    async handleDocument(parsed) {
        const action = parsed.args[1] || 'list';
        const workspaceId = parsed.args[2];

        if (!workspaceId) {
            throw new Error('Workspace ID is required');
        }

        // Redirect to appropriate handler based on action
        // Implementation would be similar to context document handling
        throw new Error(
            'Document operations not yet implemented for workspace command',
        );
    }

    /**
   * List notes in workspace
   */
    async handleNotes(parsed) {
        const workspaceId = parsed.args[1];
        if (!workspaceId) {
            throw new Error('Workspace ID is required');
        }

        try {
            const options = {
                featureArray: ['data/abstraction/note'],
            };
            const response = await this.apiClient.getDocuments(
                workspaceId,
                'workspace',
                options,
            );

            // Handle ResponseObject format
            const notes = response.payload || response.data || response;

            await this.output(notes, 'document', 'note');
            return 0;
        } catch (error) {
            throw new Error(`Failed to list notes: ${error.message}`);
        }
    }

    /**
   * Show workspace tree
   */
    async handleTree(parsed) {
        const workspaceId = parsed.args[1];
        if (!workspaceId) {
            throw new Error('Workspace ID is required');
        }

        try {
            const response = await this.apiClient.getWorkspaceTree(workspaceId);

            // Handle ResponseObject format
            const tree = response.payload || response.data || response;

            if (!tree || !tree.children) {
                console.log(chalk.yellow('No tree structure found for this workspace'));
                return 0;
            }

            console.log(chalk.bold(`Workspace Tree: ${workspaceId}`));
            console.log();
            this.displayTreeNode(tree);
            return 0;
        } catch (error) {
            throw new Error(`Failed to get workspace tree: ${error.message}`);
        }
    }

    /**
   * Show current workspace (based on bound context)
   */
    async handleCurrent(parsed) {
        try {
            // Get current context
            const session = await this.apiClient.remoteStore.getSession();

            if (!session.boundContext) {
                console.log(chalk.yellow('No context currently bound'));
                console.log();
                console.log(chalk.cyan('Bind to a context first:'));
                console.log('  canvas context bind <context-address>');
                return 1;
            }

            // Parse the context address to get remote and context info
            const resolvedContextAddress =
        await this.apiClient.remoteStore.resolveAlias(session.boundContext);
            const contextParts = resolvedContextAddress.includes(':')
                ? resolvedContextAddress.split(':')
                : [null, resolvedContextAddress];

            if (contextParts.length < 2) {
                console.log(chalk.red('Invalid context address format'));
                return 1;
            }

            const [remoteId] = contextParts;

            if (!remoteId) {
                console.log(chalk.red('Cannot determine remote from context address'));
                return 1;
            }

            // Get current remote info
            const remote = await this.apiClient.remoteStore.getRemote(remoteId);
            if (!remote) {
                console.log(chalk.red(`Remote '${remoteId}' not found`));
                return 1;
            }

            console.log(chalk.cyan('Current workspace context:'));
            console.log(`  Bound Context: ${resolvedContextAddress}`);
            console.log(`  Remote: ${remoteId}`);
            console.log(`  Remote URL: ${remote.url}`);
            console.log(`  Remote Version: ${remote.version || 'Unknown'}`);

            if (session.boundAt) {
                console.log(
                    `  Bound At: ${new Date(session.boundAt).toLocaleString()}`,
                );
            }

            // Try to get context details to show workspace info
            try {
                const contextResponse = await this.apiClient.getContext(
                    resolvedContextAddress,
                );
                const context =
          contextResponse.payload || contextResponse.data || contextResponse;

                if (context && context.url) {
                    const workspaceName = context.url.split('://')[0] || 'universe';
                    console.log(`  Workspace: ${workspaceName}`);
                    console.log(`  Context URL: ${context.url}`);
                }
            } catch (error) {
                console.log(
                    chalk.yellow(
                        `  Note: Could not fetch context details (${error.message})`,
                    ),
                );
            }

            return 0;
        } catch (error) {
            throw new Error(`Failed to get current workspace: ${error.message}`);
        }
    }

    /**
   * Display a tree node recursively
   */
    displayTreeNode(node, prefix = '', isLast = true) {
        if (!node) return;

        const connector = isLast ? '└── ' : '├── ';
        const nameDisplay = node.label || node.name || node.id;
        const typeDisplay =
      node.type === 'universe' ? chalk.cyan('[UNIVERSE]') : '';
        const colorDisplay = node.color ? chalk.hex(node.color)('●') : '';

        console.log(
            `${prefix}${connector}${nameDisplay} ${typeDisplay} ${colorDisplay}`,
        );

        if (node.description && node.description !== 'Canvas layer') {
            const descPrefix = prefix + (isLast ? '    ' : '│   ');
            console.log(`${descPrefix}${chalk.gray(node.description)}`);
        }

        if (node.children && Array.isArray(node.children)) {
            const childPrefix = prefix + (isLast ? '    ' : '│   ');
            node.children.forEach((child, index) => {
                const isLastChild = index === node.children.length - 1;
                this.displayTreeNode(child, childPrefix, isLastChild);
            });
        }
    }

    /**
   * Show help
   */
    showHelp() {
        console.log(chalk.bold('Workspace Commands:'));
        console.log(
            '  list                           List all workspaces from default remote',
        );
        console.log(
            '  current                        Show current workspace (based on bound context)',
        );
        console.log('  show <address>                 Show workspace details');
        console.log(
            '  create <name>                  Create new workspace on default remote',
        );
        console.log('  update <address>               Update workspace');
        console.log('  delete <address>               Delete workspace');
        console.log('  start <address>                Start workspace');
        console.log('  stop <address>                 Stop workspace');
        console.log('  open <address>                 Open workspace');
        console.log('  close <address>                Close workspace');
        console.log('  status <address>               Show workspace status');
        console.log('  documents <address>            List documents in workspace');
        console.log('  tabs <address>                 List tabs in workspace');
        console.log('  notes <address>                List notes in workspace');
        console.log('  tree <address>                 Show workspace tree');
        console.log();
        console.log(chalk.bold('Address Format:'));
        console.log('  user@remote:workspace          Full resource address');
        console.log(
            '  workspace                      Short form (uses default remote)',
        );
        console.log();
        console.log(chalk.bold('Options:'));
        console.log('  --label <label>                Workspace label');
        console.log('  --description <desc>           Workspace description');
        console.log('  --color <color>                Workspace color (hex)');
        console.log(
            '  --type <type>                  Workspace type (workspace, universe)',
        );
        console.log(
            '  --metadata <json>              Workspace metadata (JSON string)',
        );
        console.log(
            '  --force                        Force deletion without confirmation',
        );
        console.log();
        console.log(chalk.bold('Examples:'));
        console.log('  canvas workspace list');
        console.log(
            '  canvas workspace current                         # Show current workspace',
        );
        console.log('  canvas workspace show admin@canvas.local:universe');
        console.log(
            '  canvas workspace show universe                    # Uses default remote',
        );
        console.log(
            '  canvas workspace create my-workspace --description "My workspace"',
        );
        console.log('  canvas workspace start admin@canvas.local:universe');
        console.log('  canvas workspace documents user@work.server:reports');
        console.log('  canvas workspace delete old-workspace --force');
        console.log();
        console.log(
            chalk.cyan(
                'Note: Set a default remote with: canvas remote bind <user@remote>',
            ),
        );
        console.log(
            chalk.cyan(
                '      Aliases can be used in place of full addresses: canvas alias set prod user@remote:workspace',
            ),
        );
    }
}

export default WorkspaceCommand;

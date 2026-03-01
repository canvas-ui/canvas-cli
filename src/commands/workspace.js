'use strict';

import chalk from 'chalk';
import BaseCommand from './base.js';

export class WorkspaceCommand extends BaseCommand {
    get skipConnectionFor() { return ['list']; }
    get defaultAction() { return 'list'; }

    async execute(parsed) {
        try {
            this.options = parsed.options || {};

            if (parsed.args.length === 0) return this.handleList(parsed);

            const first = parsed.args[0];
            const knownActions = [
                'list', 'show', 'create', 'update', 'delete', 'start', 'stop',
                'status', 'documents', 'dotfiles', 'tabs', 'notes', 'tree', 'current', 'help',
            ];

            if (knownActions.includes(first)) {
                return super.execute(parsed);
            }

            // First arg is workspace ID, second is action: `canvas ws universe tree`
            const action = parsed.args[1] || 'show';
            const modified = { ...parsed, args: [action, first, ...parsed.args.slice(2)] };
            return super.execute(modified);
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            if (process.env.DEBUG) console.error(error.stack);
            return 1;
        }
    }

    // ── CRUD ──

    async handleList(parsed) {
        const remoteId = await this._tryCurrentRemote();
        if (remoteId && await this.client.isReachable(remoteId)) {
            await this.client.sync(remoteId, { contexts: false, workspaces: true });
        }

        const cached = await this._cachedWorkspaces();
        await this.output(cached, 'workspace');
        return 0;
    }

    async handleShow(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Workspace address required');
        const { api, id } = await this.client.resolve(addr);
        const ws = await api.get(`/workspaces/${id}`);
        await this.output(ws?.workspace || ws, 'workspace');
        return 0;
    }

    async handleCreate(parsed) {
        const name = parsed.args[1];
        if (!name) throw new Error('Workspace name required');
        const api = await this.client.api();
        const ws = await api.post('/workspaces', {
            name,
            label: parsed.options.label || name,
            description: parsed.options.description || '',
            type: parsed.options.type || 'workspace',
            color: parsed.options.color,
            metadata: parsed.options.metadata ? JSON.parse(parsed.options.metadata) : {},
        });
        console.log(chalk.green(`Workspace '${name}' created`));
        await this.output(ws, 'workspace');
        return 0;
    }

    async handleUpdate(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Workspace address required');
        const data = {};
        if (parsed.options.label) data.label = parsed.options.label;
        if (parsed.options.description) data.description = parsed.options.description;
        if (parsed.options.color) data.color = parsed.options.color;
        if (parsed.options.metadata) data.metadata = JSON.parse(parsed.options.metadata);
        if (Object.keys(data).length === 0) throw new Error('Nothing to update. Use --label, --description, --color, or --metadata');

        const { api, id } = await this.client.resolve(addr);
        const ws = await api.patch(`/workspaces/${id}`, data);
        console.log(chalk.green(`Workspace '${addr}' updated`));
        await this.output(ws, 'workspace');
        return 0;
    }

    async handleDelete(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Workspace address required');
        if (!parsed.options.force) {
            console.log(chalk.yellow(`Will permanently delete '${addr}'. Use --force to confirm.`));
            return 1;
        }
        const { api, id } = await this.client.resolve(addr);
        await api.del(`/workspaces/${id}`);
        console.log(chalk.green(`Workspace '${addr}' deleted`));
        return 0;
    }

    // ── Lifecycle ──

    async handleStart(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Workspace address required');
        const { api, id } = await this.client.resolve(addr);
        await api.post(`/workspaces/${id}/start`);
        console.log(chalk.green(`Workspace '${addr}' started`));
        return 0;
    }

    async handleStop(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Workspace address required');
        const { api, id } = await this.client.resolve(addr);
        await api.post(`/workspaces/${id}/stop`);
        console.log(chalk.green(`Workspace '${addr}' stopped`));
        return 0;
    }

    async handleStatus(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Workspace address required');
        const { api, id } = await this.client.resolve(addr);
        const status = await api.get(`/workspaces/${id}/status`);
        console.log(chalk.bold(`Workspace Status: ${addr}`));
        console.log(`  Status: ${status.status || JSON.stringify(status)}`);
        return 0;
    }

    // ── Tree ──

    async handleTree(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Workspace address required');
        const { api, id } = await this.client.resolve(addr);
        const tree = await api.get(`/workspaces/${id}/tree`);
        if (!tree?.children) {
            console.log(chalk.yellow('No tree structure found'));
            return 0;
        }
        console.log(chalk.bold(`Workspace Tree: ${addr}`));
        console.log();
        this.displayTree(tree);
        return 0;
    }

    // ── Documents ──

    async handleDocuments(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Workspace address required');
        const search = parsed.args[2] || null;
        const { api, id } = await this.client.resolve(addr);

        const params = {};
        if (search) params.q = search;
        if (parsed.options.feature) params.featureArray = [].concat(parsed.options.feature);
        if (parsed.options.filter) params.filterArray = [].concat(parsed.options.filter);
        if (parsed.options['context-path']) params.contextSpec = parsed.options['context-path'];

        const docs = await api.get(`/workspaces/${id}/documents`, params);
        const list = docs?.data && Array.isArray(docs.data) ? docs.data : docs;
        await this.output(list, 'document');
        return 0;
    }

    async handleDotfiles(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Workspace address required');
        const { api, id } = await this.client.resolve(addr);
        const docs = await api.get(`/workspaces/${id}/documents`, { featureArray: 'data/abstraction/dotfile' });
        const list = docs?.data && Array.isArray(docs.data) ? docs.data : docs;
        await this.output(list, 'document', 'dotfile');
        return 0;
    }

    async handleTabs(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Workspace address required');
        const { api, id } = await this.client.resolve(addr);
        const docs = await api.get(`/workspaces/${id}/documents`, { featureArray: 'data/abstraction/tab' });
        await this.output(docs, 'document', 'tab');
        return 0;
    }

    async handleNotes(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Workspace address required');
        const { api, id } = await this.client.resolve(addr);
        const docs = await api.get(`/workspaces/${id}/documents`, { featureArray: 'data/abstraction/note' });
        await this.output(docs, 'document', 'note');
        return 0;
    }

    // ── Current ──

    async handleCurrent() {
        const session = await this.client.store.getSession();
        if (!session.boundContext) {
            console.log(chalk.yellow('No context bound'));
            console.log(chalk.cyan('Bind: canvas context bind <address>'));
            return 1;
        }

        const resolved = await this.client.store.resolveAlias(session.boundContext);
        const parts = resolved.includes(':') ? resolved.split(':') : [null, resolved];
        const remoteId = parts[0];

        if (!remoteId) { console.log(chalk.red('Cannot determine remote')); return 1; }

        const remote = await this.client.store.getRemote(remoteId);
        if (!remote) { console.log(chalk.red(`Remote '${remoteId}' not found`)); return 1; }

        console.log(chalk.cyan('Current:'));
        console.log(`  Context: ${resolved}`);
        console.log(`  Remote:  ${remoteId} (${remote.url})`);
        if (session.boundAt) console.log(`  Bound:   ${new Date(session.boundAt).toLocaleString()}`);

        try {
            const api = await this.client.api(remoteId);
            const ctx = await api.get(`/contexts/${parts.slice(1).join(':')}`);
            const c = ctx?.context || ctx;
            if (c?.url) {
                console.log(`  Workspace: ${c.url.split('://')[0] || 'universe'}`);
                console.log(`  URL:       ${c.url}`);
            }
        } catch (e) {
            console.log(chalk.yellow(`  Could not fetch context: ${e.message}`));
        }
        return 0;
    }

    // ── Helpers ──

    async _tryCurrentRemote() {
        try { return await this.client.currentRemote(); }
        catch { return null; }
    }

    async _cachedWorkspaces() {
        const cached = await this.client.store.getWorkspaces();
        return Object.entries(cached)
            .map(([key, ws]) => {
                const [remoteId, wsId] = key.includes(':') ? key.split(':', 2) : ['local', key];
                return { address: remoteId, id: wsId, ...ws };
            })
            .sort((a, b) => a.address.localeCompare(b.address) || (a.name || '').localeCompare(b.name || ''));
    }

    showHelp() {
        console.log(chalk.bold('Workspace Commands:'));
        console.log('  list                       List workspaces');
        console.log('  current                    Show current workspace');
        console.log('  show <address>             Show details');
        console.log('  create <name>              Create workspace');
        console.log('  update <address>           Update workspace');
        console.log('  delete <address>           Delete workspace');
        console.log('  start/stop <address>       Start/stop workspace');
        console.log('  status <address>           Show status');
        console.log('  tree <address>             Show tree');
        console.log('  documents <address> [q]    List/search documents');
        console.log('  dotfiles/tabs/notes <addr> List by type');
        console.log();
        console.log(chalk.bold('Shorthand:'));
        console.log('  canvas ws universe tree    = canvas ws tree universe');
    }
}

export default WorkspaceCommand;

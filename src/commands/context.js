'use strict';

import chalk from 'chalk';
import BaseCommand from './base.js';

export class ContextCommand extends BaseCommand {
    get skipConnectionFor() { return ['list']; }
    get defaultAction() { return 'current'; }

    // ── CRUD ──

    async handleList() {
        const remoteId = await this._tryCurrentRemote();
        if (remoteId && await this.client.isReachable(remoteId)) {
            await this.client.sync(remoteId, { contexts: true, workspaces: false });
        }

        const cached = await this._cachedContexts();
        await this.output(cached, 'context');
        return 0;
    }

    async handleShow(parsed) {
        const addr = parsed.args[1] || await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);
        const ctx = await api.get(`/contexts/${id}`);
        await this.output(ctx?.context || ctx, 'context');
        return 0;
    }

    async handleCreate(parsed) {
        const contextId = parsed.args[1];
        if (!contextId) throw new Error('Context ID required');

        const data = { id: contextId, description: parsed.options.description || '', metadata: {} };
        const url = parsed.args[2];
        if (url) {
            data.url = url.includes('://') ? url : `universe://${url.startsWith('/') ? url : '/' + url}`;
        }
        if (parsed.options.color) data.metadata.color = parsed.options.color;

        const api = await this.client.api();
        const ctx = await api.post('/contexts', data);
        console.log(chalk.green(`Context '${contextId}' created`));
        await this.output(ctx?.context || ctx, 'context');
        return 0;
    }

    async handleDestroy(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Context address required');
        const { api, id } = await this.client.resolve(addr);
        await api.del(`/contexts/${id}`);
        console.log(chalk.green(`Context '${addr}' destroyed`));
        return 0;
    }

    async handleUpdate(parsed) {
        const contextId = parsed.args[1];
        if (!contextId) throw new Error('Context ID required');
        const data = {};
        if (parsed.options.description) data.description = parsed.options.description;
        if (parsed.options.metadata) data.metadata = JSON.parse(parsed.options.metadata);
        if (Object.keys(data).length === 0) throw new Error('Nothing to update. Use --description or --metadata');

        const { api, id } = await this.client.resolve(contextId);
        const ctx = await api.put(`/contexts/${id}`, data);
        console.log(chalk.green(`Context '${contextId}' updated`));
        await this.output(ctx?.context || ctx, 'context');
        return 0;
    }

    // ── Bind / Switch ──

    async handleSwitch(parsed) { return this.handleBind(parsed); }

    async handleBind(parsed) {
        const addr = parsed.args[1];
        if (!addr) throw new Error('Context address required');

        const resolved = await this.client.store.resolveAlias(addr);
        let contextUrl = null, contextId = null, remoteStatus = 'disconnected';

        try {
            const { api, id, remote } = await this.client.resolve(resolved);
            contextId = id;
            const ctx = await api.get(`/contexts/${id}`);
            const c = ctx?.context || ctx;
            contextUrl = c?.url;
            contextId = c?.id || contextId;
            if (await this.client.isReachable(remote)) remoteStatus = 'connected';
        } catch (e) {
            this.debug('Context details unavailable:', e.message);
        }

        await this.client.store.updateSession({
            boundContext: resolved, boundContextUrl: contextUrl,
            boundContextId: contextId, boundRemoteStatus: remoteStatus,
            boundAt: new Date().toISOString(),
        });

        const label = resolved !== addr ? `'${resolved}' (alias '${addr}')` : `'${resolved}'`;
        console.log(chalk.green(`Switched to context ${label}`));
        return 0;
    }

    // ── URL / Path ──

    async handleSet(parsed) {
        const url = parsed.args[1];
        if (!url) throw new Error('URL required');
        const addr = await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);
        const result = await api.post(`/contexts/${id}/url`, { url });
        console.log(chalk.green(`Context URL set to '${result.url || url}'`));

        const session = await this.client.store.getSession();
        if (session.boundContext) {
            await this.client.store.updateSession({ boundContextUrl: result.url || url });
        }
        return 0;
    }

    async handleUrl(parsed) {
        const addr = parsed.args[1] || await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);
        const data = await api.get(`/contexts/${id}/url`);
        console.log(data.url || data);
        return 0;
    }

    async handleBaseUrl(parsed) {
        const addr = parsed.args[1] || await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);
        const data = await api.get(`/contexts/${id}/url`);
        const url = data.url || data;
        console.log(url?.includes('://') ? url.split('://')[0] : 'universe');
        return 0;
    }

    async handlePath(parsed) {
        const addr = parsed.args[1] || await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);
        const data = await api.get(`/contexts/${id}/path`);
        console.log(data.path || data);
        return 0;
    }

    async handlePaths(parsed) {
        const addr = parsed.args[1] || await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);
        const tree = await api.get(`/contexts/${id}/tree`);
        if (!tree?.children) { console.log(chalk.yellow('No tree found')); return 0; }
        this.extractPaths(tree).forEach((p) => console.log(p));
        return 0;
    }

    // ── Tree ──

    async handleTree(parsed) {
        const addr = parsed.args[1] || await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);
        const tree = await api.get(`/contexts/${id}/tree`);
        if (!tree?.children) { console.log(chalk.yellow('No tree found')); return 0; }
        console.log(chalk.bold(`Context Tree: ${addr}`));
        console.log();
        this.displayTree(tree);
        return 0;
    }

    async handleWorkspace(parsed) {
        const addr = parsed.args[1] || await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);
        const data = await api.get(`/contexts/${id}/url`);
        const url = data.url || data;
        console.log(url?.includes('://') ? url.split('://')[0] : 'universe');
        return 0;
    }

    // ── Current ──

    async handleCurrent(parsed) {
        try {
            const addr = await this.getCurrentContext(parsed.options);
            const session = await this.client.store.getSession();

            console.log(chalk.cyan('Current context:'), addr);
            if (session.boundRemote) console.log(chalk.cyan('Remote:'), session.boundRemote);
            if (session.boundAt) console.log(chalk.cyan('Bound:'), new Date(session.boundAt).toLocaleString());

            try {
                const { api, id } = await this.client.resolve(addr);
                const ctx = await api.get(`/contexts/${id}`);
                await this.output(ctx?.context || ctx, 'context');
            } catch {
                console.log(chalk.yellow('Context not found on server'));
            }
            return 0;
        } catch {
            console.log(chalk.red('No context set.'));
            console.log(chalk.cyan('Use: canvas context bind <address>'));
            return 1;
        }
    }

    // ── Documents ──

    async handleDocuments(parsed) {
        let addr, search = null;
        if (parsed.args.length >= 2) {
            const pot = parsed.args[1];
            if (pot.includes(':') || pot.includes('@')) {
                addr = pot;
                search = parsed.args[2] || null;
            } else {
                addr = await this.getCurrentContext(parsed.options);
                search = pot;
            }
        } else {
            addr = await this.getCurrentContext(parsed.options);
        }

        const { api, id } = await this.client.resolve(addr);
        const params = {};
        if (search) params.q = search;
        if (parsed.options.feature) params.featureArray = [].concat(parsed.options.feature);
        if (parsed.options.filter) params.filterArray = [].concat(parsed.options.filter);

        const docs = await api.get(`/contexts/${id}/documents`, params);
        await this.output(docs, 'document');
        return 0;
    }

    async handleDotfiles(parsed) {
        const addr = parsed.args[1] || await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);
        const docs = await api.get(`/contexts/${id}/documents`, { featureArray: 'data/abstraction/dotfile' });
        await this.output(docs, 'document', 'dotfile');
        return 0;
    }

    async handleDot(parsed) { return this.handleDotfiles(parsed); }

    // ── Tabs ──

    async handleTabs(parsed) { return this._listByType(parsed, 'tab'); }
    async handleTab(parsed) {
        const action = parsed.args[1] || 'list';
        if (action === 'list') return this._listByType(parsed, 'tab');
        if (action === 'add') return this._addDoc(parsed, 'tab', 2);
        if (action === 'get') return this._getDoc(parsed, 2);
        if (action === 'delete') return this._bulkDocOp(parsed, 'delete', 'tab', 2);
        if (action === 'remove') return this._bulkDocOp(parsed, 'remove', 'tab', 2);
        console.error(chalk.red(`Unknown tab action: ${action}`));
        return 1;
    }

    // ── Notes ──

    async handleNotes(parsed) { return this._listByType(parsed, 'note'); }
    async handleNote(parsed) {
        const action = parsed.args[1] || 'list';
        if (action === 'list') return this._listByType(parsed, 'note');
        if (action === 'add') return this._addDoc(parsed, 'note', 2);
        if (action === 'get') return this._getDoc(parsed, 2);
        if (action === 'delete') return this._bulkDocOp(parsed, 'delete', 'note', 2);
        if (action === 'remove') return this._bulkDocOp(parsed, 'remove', 'note', 2);
        console.error(chalk.red(`Unknown note action: ${action}`));
        return 1;
    }

    // ── Document commands ──

    async handleDocument(parsed) {
        const action = parsed.args[1] || 'list';
        if (action === 'get') return this._getDoc(parsed, 2);
        if (action === 'delete') return this._bulkDocOp(parsed, 'delete', 'document', 2);
        if (action === 'remove') return this._bulkDocOp(parsed, 'remove', 'document', 2);
        console.error(chalk.red(`Unknown document action: ${action}`));
        return 1;
    }

    // ── Shared document helpers ──

    async _listByType(parsed, type) {
        const addr = await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);
        const docs = await api.get(`/contexts/${id}/documents`, { featureArray: `data/abstraction/${type}` });
        await this.output(docs, 'document', type);
        return 0;
    }

    async _addDoc(parsed, type, argOffset) {
        const value = parsed.args[argOffset];
        if (!value) throw new Error(`${type === 'tab' ? 'URL' : 'Text'} required`);

        const addr = await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);

        const doc = { schema: `data/abstraction/${type}`, data: { timestamp: new Date().toISOString() } };
        if (type === 'tab') {
            doc.data.url = value;
            doc.data.title = parsed.options.title || value;
        } else {
            doc.data.content = value;
            doc.data.title = parsed.options.title || `Note - ${new Date().toLocaleString()}`;
        }

        await api.post(`/contexts/${id}/documents`, {
            documents: [doc],
            featureArray: [`data/abstraction/${type}`, 'client/app/canvas-cli'],
        });
        console.log(chalk.green(`${type} added`));
        return 0;
    }

    async _getDoc(parsed, argOffset) {
        const docId = parsed.args[argOffset];
        if (!docId) throw new Error('Document ID required');
        const addr = await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);
        const doc = await api.get(`/contexts/${id}/documents/${docId}`);
        await this.output(doc?.document || doc, 'document');
        return 0;
    }

    async _bulkDocOp(parsed, operation, docType, argOffset) {
        const ids = parsed.args.slice(argOffset);
        if (ids.length === 0) throw new Error('At least one document ID required');

        const addr = await this.getCurrentContext(parsed.options);
        const { api, id } = await this.client.resolve(addr);

        const endpoint = operation === 'delete'
            ? `/contexts/${id}/documents`
            : `/contexts/${id}/documents/remove`;

        const result = await api.del(endpoint, ids);
        const successful = result?.successful || ids;
        const failed = result?.failed || [];

        const label = operation === 'delete' ? 'deleted' : 'removed';
        if (successful.length) {
            console.log(chalk.green(`${successful.length} ${docType}(s) ${label}`));
        }
        if (failed.length) {
            console.log(chalk.red(`${failed.length} ${docType}(s) failed`));
            failed.forEach((f) => console.log(chalk.red(`  ${f.id || f}: ${f.error || 'unknown'}`)));
        }
        return failed.length === ids.length ? 1 : 0;
    }

    // ── Helpers ──

    async _tryCurrentRemote() {
        try { return await this.client.currentRemote(); }
        catch { return null; }
    }

    async _cachedContexts() {
        const cached = await this.client.store.getContexts();
        return Object.entries(cached)
            .map(([key, ctx]) => {
                const [remoteId, ctxId] = key.includes(':') ? key.split(':', 2) : ['local', key];
                return { address: remoteId, id: ctxId, ...ctx };
            })
            .sort((a, b) => a.address.localeCompare(b.address) || (a.id || '').localeCompare(b.id || ''));
    }

    showHelp() {
        console.log(chalk.bold('Context Commands:'));
        console.log('  current               Show current context');
        console.log('  list                  List all contexts');
        console.log('  show [id]             Show context details');
        console.log('  create <id> [url]     Create context');
        console.log('  destroy <id>          Delete context');
        console.log('  switch/bind <id>      Switch to context');
        console.log('  set <url>             Set context URL');
        console.log('  url/path [id]         Get URL/path');
        console.log('  paths                 List all tree paths');
        console.log('  tree [id]             Show tree');
        console.log('  update <id>           Update context');
        console.log();
        console.log(chalk.bold('Documents:'));
        console.log('  documents [search]    List/search documents');
        console.log('  tab list/add/get/delete/remove');
        console.log('  note list/add/get/delete/remove');
        console.log('  document get/delete/remove');
        console.log('  dotfiles              List dotfiles');
    }
}

export default ContextCommand;

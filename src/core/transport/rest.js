'use strict';

import { CanvasApiClient } from '@augmentd-labs/canvas-api-client';
import { API_BASE, DEFAULT_TIMEOUT_MS } from '@augmentd-labs/canvas-protocol';
import session from '../session.js';
import { remotes as remotesStore, resolveAlias } from '../storage.js';
import { CanvasError, AuthError, UsageError } from '../errors.js';
import {
    parseResourceAddress,
    resolveRemoteByShortname,
} from './address.js';

/**
 * Thin remote-aware wrapper over the shared @augmentd-labs/canvas-api-client. The namespace
 * surface (.auth/.workspaces/.contexts/.agents/.roles, get/post/put/patch/
 * delete, ping) comes from CanvasApiClient; this class only binds it to a
 * remote registry entry. Token freshness: getToken closes over the same
 * `remote` snapshot the old axios interceptor read, and CanvasClient still
 * busts its cache on save/update.
 */
export class RemoteClient extends CanvasApiClient {
    constructor(remote) {
        super({
            baseUrl: remote.url,
            apiBase: remote.apiBase || API_BASE,
            timeout: remote.timeout || DEFAULT_TIMEOUT_MS,
            getToken: () => remote?.auth?.token || null,
            userAgent: 'canvas-cli',
        });
        this.remote = remote;
    }

    token() { return this.remote?.auth?.token || null; }
}

export class CanvasClient {
    constructor() {
        this._cache = new Map();
    }

    remotes() { return remotesStore.read(); }
    getRemote(id) { return remotesStore.get(id); }

    saveRemote(id, cfg) {
        remotesStore.set(id, { ...cfg, lastSynced: new Date().toISOString() });
        this._cache.delete(id);
    }

    updateRemote(id, patch) {
        const cur = remotesStore.get(id);
        if (!cur) throw new CanvasError(`Unknown remote: ${id}`);
        remotesStore.set(id, { ...cur, ...patch });
        this._cache.delete(id);
    }

    removeRemote(id) {
        remotesStore.delete(id);
        this._cache.delete(id);
    }

    clearCache(id) { id ? this._cache.delete(id) : this._cache.clear(); }

    client(id) {
        const remoteId = id || session.boundRemote();
        if (!remoteId) throw new AuthError('No remote bound. Use `canvas remote bind <id>`.');
        if (this._cache.has(remoteId)) return this._cache.get(remoteId);
        const remote = remotesStore.get(remoteId);
        if (!remote) throw new CanvasError(`Unknown remote: ${remoteId}`);
        const c = new RemoteClient({ ...remote, id: remoteId });
        this._cache.set(remoteId, c);
        return c;
    }

    createTransient(remoteCfg) {
        return new RemoteClient(remoteCfg);
    }

    currentRemote() { return session.boundRemote(); }

    resolveRemoteShortname(name) {
        return resolveRemoteByShortname(name, this.remotes());
    }

    resolve(token) {
        if (!token) throw new UsageError('Resource address required');
        const resolved = resolveAlias(token);
        const parsed = parseResourceAddress(resolved);
        if (parsed) {
            const remoteId = this.resolveRemoteShortname(
                `${parsed.userIdentifier}@${parsed.remote}`,
            ) || `${parsed.userIdentifier}@${parsed.remote}`;
            return {
                api: this.client(remoteId),
                remoteId,
                id: parsed.resource,
                path: parsed.path,
                full: resolved,
            };
        }
        // Bare id → use bound remote
        const remoteId = session.boundRemote();
        if (!remoteId) throw new AuthError('No remote bound and address has no @remote');
        return {
            api: this.client(remoteId),
            remoteId,
            id: resolved,
            path: '',
            full: resolved,
        };
    }

    async ping(id) { return this.client(id).ping(); }
}

export default CanvasClient;

'use strict';

import axios from 'axios';
import session from '../session.js';
import { remotes as remotesStore, resolveAlias } from '../storage.js';
import { CanvasError, AuthError, UsageError } from '../errors.js';
import {
    parseResourceAddress,
    resolveRemoteByShortname,
} from './address.js';

const DEFAULT_API_BASE = '/rest/v2';
const DEFAULT_TIMEOUT = 30000;

export class RemoteClient {
    constructor(remote) {
        this.remote = remote;
        this.http = axios.create({
            baseURL: `${remote.url.replace(/\/$/, '')}${remote.apiBase || DEFAULT_API_BASE}`,
            timeout: remote.timeout || DEFAULT_TIMEOUT,
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-cli' },
        });
        this.http.interceptors.request.use((cfg) => {
            const token = this.token();
            if (token) cfg.headers.Authorization = `Bearer ${token}`;
            return cfg;
        });
        this.auth = makeAuthApi(this);
        this.workspaces = makeWorkspacesApi(this);
        this.contexts = makeContextsApi(this);
        this.agents = makeAgentsApi(this);
        this.roles = makeRolesApi(this);
    }

    token() { return this.remote?.auth?.token || null; }

    async request(method, path, { params, data, headers } = {}) {
        try {
            const res = await this.http.request({ method, url: path, params, data, headers });
            return unwrap(res.data);
        } catch (err) {
            throw toCanvasError(err);
        }
    }

    get(path, opts) { return this.request('GET', path, opts); }
    post(path, data, opts) { return this.request('POST', path, { ...opts, data: data ?? {} }); }
    put(path, data, opts) { return this.request('PUT', path, { ...opts, data: data ?? {} }); }
    patch(path, data, opts) { return this.request('PATCH', path, { ...opts, data: data ?? {} }); }
    delete(path, opts) { return this.request('DELETE', path, opts); }

    ping() { return this.get('/ping'); }
}

function makeAuthApi(c) {
    return {
        login: (creds) => c.post('/auth/login', { strategy: 'auto', ...creds }),
        logout: () => c.post('/auth/logout'),
        me: () => c.get('/auth/me'),
        status: () => c.get('/auth/status'),
        tokens: {
            list: () => c.get('/auth/tokens'),
            create: (data) => c.post('/auth/tokens', data),
            delete: (id) => c.delete(`/auth/tokens/${id}`),
            update: (id, data) => c.put(`/auth/tokens/${id}`, data),
        },
        devices: {
            register: (data) => c.post('/auth/devices/register', data),
            list: () => c.get('/auth/devices'),
            update: (id, data) => c.patch(`/auth/devices/${id}`, data),
        },
    };
}

function makeWorkspacesApi(c) {
    return {
        list: () => c.get('/workspaces'),
        get: (id) => c.get(`/workspaces/${id}`),
        create: (data) => c.post('/workspaces', data),
        update: (id, data) => c.put(`/workspaces/${id}`, data),
        delete: (id) => c.delete(`/workspaces/${id}`),
        start: (id) => c.post(`/workspaces/${id}/start`),
        stop: (id) => c.post(`/workspaces/${id}/stop`),
        status: (id) => c.get(`/workspaces/${id}/status`),
        stats: (id) => c.get(`/workspaces/${id}/stats`),
        tree: (id) => c.get(`/workspaces/${id}/tree`),
        trees: (id) => c.get(`/workspaces/${id}/trees`),
        documents: (id, params) => c.get(`/workspaces/${id}/documents`, { params }),
        insertDocuments: (id, body) => c.post(`/workspaces/${id}/documents`, body),
        dotfiles: {
            list: (id, params) => c.get(`/workspaces/${id}/dotfiles`, { params }),
            create: (id, dotfiles, opts = {}) =>
                c.post(`/workspaces/${id}/dotfiles`, {
                    dotfiles: Array.isArray(dotfiles) ? dotfiles : [dotfiles],
                    ...opts,
                }),
            update: (id, docs, opts = {}) =>
                c.put(`/workspaces/${id}/dotfiles`, { documents: docs, ...opts }),
            delete: (id, docIds) =>
                c.delete(`/workspaces/${id}/dotfiles`, { data: docIds }),
            status: (id) => c.get(`/workspaces/${id}/dotfiles/status`),
            init: (id) => c.post(`/workspaces/${id}/dotfiles/init`),
        },
        hooks: {
            list: (id) => c.get(`/workspaces/${id}/hooks`),
            get: (id, hookPath) => c.get(`/workspaces/${id}/hooks/${hookPath}`),
            set: (id, hookPath, content) => c.put(`/workspaces/${id}/hooks/${hookPath}`, { content }),
            delete: (id, hookPath) => c.delete(`/workspaces/${id}/hooks/${hookPath}`),
        },
    };
}

function makeContextsApi(c) {
    return {
        list: () => c.get('/contexts'),
        get: (id) => c.get(`/contexts/${id}`),
        create: (data) => c.post('/contexts', data),
        update: (id, data) => c.put(`/contexts/${id}`, data),
        delete: (id) => c.delete(`/contexts/${id}`),
        tree: (id) => c.get(`/contexts/${id}/tree`),
        documents: (id, params) => c.get(`/contexts/${id}/documents`, { params }),
        insertDocuments: (id, body) => c.post(`/contexts/${id}/documents`, body),
        dotfiles: (id) => c.get(`/contexts/${id}/dotfiles`),
    };
}

function makeAgentsApi(c) {
    return {
        list: () => c.get('/agents'),
        get: (id) => c.get(`/agents/${id}`),
        status: (id) => c.get(`/agents/${id}/status`),
        prompt: (id, data) => c.post(`/agents/${id}/prompt`, data),
    };
}

function makeRolesApi(c) {
    return {
        list: () => c.get('/roles'),
        get: (id) => c.get(`/roles/${id}`),
    };
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

function unwrap(body) {
    if (!body || typeof body !== 'object') return body;
    if (Object.prototype.hasOwnProperty.call(body, 'payload')) {
        if (body.status === 'error') {
            throw new CanvasError(body.message || 'Request failed', {
                code: body.statusCode, status: body.statusCode,
            });
        }
        return body.payload;
    }
    return body;
}

function toCanvasError(err) {
    if (err instanceof CanvasError) return err;
    if (err?.response?.data) {
        try { unwrap(err.response.data); } catch (e) { return e; }
    }
    const msg = err?.response?.data?.message || err.message || 'Request failed';
    return new CanvasError(msg, { status: err?.response?.status, cause: err });
}

export default CanvasClient;

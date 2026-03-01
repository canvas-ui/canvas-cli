'use strict';

import axios from 'axios';
import os from 'os';
import { remoteStore } from './utils/config.js';
import { parseResourceAddress, extractRemoteIdentifier } from './utils/address-parser.js';

/**
 * Unwrap the ResponseObject envelope, returning payload directly
 */
function unwrap(response) {
    const d = response.data;
    if (d && typeof d === 'object' && 'status' in d && 'statusCode' in d) {
        return d.payload !== undefined ? d.payload : d;
    }
    return d;
}

function formatError(error, baseURL) {
    if (error.response) {
        const { status, data } = error.response;
        const msg = data?.message || data?.error || `HTTP ${status}`;
        return new Error(`API Error (${status}): ${msg}`);
    }
    if (error.request) {
        return new Error(`Cannot connect to Canvas server at ${baseURL}`);
    }
    return new Error(error.message);
}

// ── Per-remote HTTP client with auto-unwrap ──────────────────────────

class RemoteClient {
    constructor(baseURL, token, hooks = {}) {
        this.baseURL = baseURL;
        this.token = token;
        this._hooks = hooks;
        this._deviceToken = null;
        this._deviceTokenPending = null;

        this.http = axios.create({
            baseURL,
            timeout: 30000,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'canvas-cli/1.0.0',
                'X-App-Name': 'canvas-cli',
            },
        });

        this.http.interceptors.request.use((cfg) => this._onRequest(cfg));
        this.http.interceptors.response.use(
            (r) => r,
            (e) => Promise.reject(formatError(e, baseURL)),
        );
    }

    async _onRequest(cfg) {
        const method = (cfg.method || 'get').toLowerCase();
        const url = cfg.url || '';
        const isWrite = ['post', 'put', 'patch'].includes(method);
        const isIngest = isWrite && /\/(contexts|workspaces)\/[^/]+\/documents\b/.test(url);
        const isDeviceReg = url.includes('/auth/devices/register');

        if (isIngest && !isDeviceReg) {
            cfg.headers.Authorization = `Bearer ${await this._ensureDeviceToken()}`;
        } else if (this.token) {
            cfg.headers.Authorization = `Bearer ${this.token}`;
        }

        if (isWrite) {
            cfg.headers['Content-Type'] = 'application/json';
            if (cfg.data == null) cfg.data = {};
        }

        return cfg;
    }

    // ── HTTP verbs (auto-unwrap ResponseObject) ──

    async get(path, params) {
        return unwrap(await this.http.get(path, { params }));
    }

    async post(path, data) {
        return unwrap(await this.http.post(path, data));
    }

    async put(path, data) {
        return unwrap(await this.http.put(path, data));
    }

    async patch(path, data) {
        return unwrap(await this.http.patch(path, data));
    }

    async del(path, data, params) {
        const opts = {};
        if (data !== undefined) opts.data = data;
        if (params) opts.params = params;
        return unwrap(await this.http.delete(path, Object.keys(opts).length ? opts : undefined));
    }

    // ── Device token (for ingest endpoints) ──

    async _ensureDeviceToken() {
        if (this._deviceToken) return this._deviceToken;
        if (this._deviceTokenPending) return this._deviceTokenPending;
        if (!this.token) throw new Error('No user token for device registration');

        this._deviceTokenPending = (async () => {
            const resp = await axios.post(`${this.baseURL}/auth/devices/register`, {
                name: os.hostname(), hostname: os.hostname(),
                platform: process.platform, arch: process.arch, type: 'cli',
            }, {
                timeout: 30000,
                headers: {
                    Accept: 'application/json', 'Content-Type': 'application/json',
                    'User-Agent': 'canvas-cli/1.0.0', 'X-App-Name': 'canvas-cli',
                    Authorization: `Bearer ${this.token}`,
                },
            });

            const body = resp.data?.payload || resp.data;
            const token = body?.token;
            if (!token?.startsWith('canvas-')) {
                throw new Error('Device registration did not return a valid token');
            }

            this._deviceToken = token;
            this._hooks.onDeviceToken?.(token, body.deviceId);
            return token;
        })();

        try { return await this._deviceTokenPending; }
        finally { this._deviceTokenPending = null; }
    }
}

// ── Main client: multi-remote, address resolution, sync ─────────────

export class CanvasClient {
    constructor() {
        this.store = remoteStore;
        this._clients = new Map();
    }

    // ── Remote client management ──

    async _remoteClient(remoteId) {
        if (this._clients.has(remoteId)) return this._clients.get(remoteId);

        const remote = await this.store.getRemote(remoteId);
        if (!remote) {
            throw new Error(`Remote '${remoteId}' not found. Add: canvas remote add ${remoteId} <url>`);
        }

        const client = new RemoteClient(
            remote.url + (remote.apiBase || '/rest/v2'),
            remote.auth?.token || '',
            {
                onDeviceToken: async (token, deviceId) => {
                    const r = await this.store.getRemote(remoteId);
                    if (!r) return;
                    const auth = { ...(r.auth || {}), deviceToken: token };
                    if (deviceId) auth.deviceId = deviceId;
                    await this.store.updateRemote(remoteId, { auth });
                },
            },
        );

        this._clients.set(remoteId, client);
        return client;
    }

    async currentRemote() {
        const session = await this.store.getSession();
        if (!session.boundRemote) {
            throw new Error('No default remote bound. Use: canvas remote bind <user@remote>');
        }
        return session.boundRemote;
    }

    /**
     * Get a RemoteClient for the given (or default) remote.
     * Returns an object with get/post/put/patch/del that auto-unwrap.
     */
    async api(remoteId) {
        return this._remoteClient(remoteId || await this.currentRemote());
    }

    /**
     * Resolve a resource address (or alias) → { api, id, remote }
     * Handles: user@remote:resource, alias, or plain ID (uses default remote).
     */
    async resolve(addressOrId) {
        const resolved = await this.store.resolveAlias(addressOrId);
        const parsed = parseResourceAddress(resolved);

        let remoteId, resourceId;
        if (parsed) {
            remoteId = extractRemoteIdentifier(resolved);
            resourceId = parsed.resource;
        } else {
            remoteId = await this.currentRemote();
            resourceId = resolved;
        }

        return { api: await this._remoteClient(remoteId), id: resourceId, remote: remoteId };
    }

    // ── Health ──

    async ping(remoteId) {
        const api = await this.api(remoteId);
        return api.get('/ping');
    }

    async isReachable(remoteId) {
        try { await this.ping(remoteId); return true; }
        catch { return false; }
    }

    // ── Sync (one implementation to rule them all) ──

    async sync(remoteId, { contexts = true, workspaces = true, silent = true } = {}) {
        const api = await this.api(remoteId);
        const info = await api.get('/ping');

        if (info?.version) {
            await this.store.updateRemote(remoteId, {
                version: info.version,
                appName: info.appName || 'canvas-server',
            });
        }

        if (workspaces) {
            const ws = await api.get('/workspaces');
            const list = Array.isArray(ws) ? ws : [];
            const keys = new Set();
            for (const w of list) {
                const key = `${remoteId}:${w.id || w.name}`;
                keys.add(key);
                await this.store.updateWorkspace(key, w);
            }
            const local = await this.store.getWorkspaces();
            for (const k of Object.keys(local)) {
                if (k.startsWith(`${remoteId}:`) && !keys.has(k)) {
                    await this.store.removeWorkspace(k);
                }
            }
            if (!silent) console.log(`    Synced ${list.length} workspaces`);
        }

        if (contexts) {
            const ctxs = await api.get('/contexts');
            const list = Array.isArray(ctxs) ? ctxs : [];
            const keys = new Set();
            for (const c of list) {
                const key = `${remoteId}:${c.id}`;
                keys.add(key);
                await this.store.updateContext(key, c);
            }
            const local = await this.store.getContexts();
            for (const k of Object.keys(local)) {
                if (k.startsWith(`${remoteId}:`) && !keys.has(k)) {
                    await this.store.removeContext(k);
                }
            }
            if (!silent) console.log(`    Synced ${list.length} contexts`);
        }

        await this.store.updateRemote(remoteId, { lastSynced: new Date().toISOString() });
        return info;
    }

    clearCache() {
        this._clients.clear();
    }
}

export default CanvasClient;

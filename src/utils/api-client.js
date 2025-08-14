'use strict';

import axios from 'axios';
import { remoteStore } from './config.js';
import {
    parseResourceAddress,
    extractRemoteIdentifier,
    extractResourceKey,
    isLocalRemote,
} from './address-parser.js';
import { setupDebug } from '../lib/debug.js';

const debug = setupDebug('canvas:cli:enhanced-api');

/**
 * Base Canvas API Client
 */
class BaseCanvasApiClient {
    constructor(config) {
        this.config = config;
        this.baseURL = config.get('server.url');
        this.token = config.get('server.auth.token');

        // Create axios instance
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'canvas-cli/1.0.0',
            },
        });

        // Add request interceptor for authentication and content-type
        this.client.interceptors.request.use((config) => {
            if (this.token) {
                config.headers.Authorization = `Bearer ${this.token}`;
            }

            // Set content-type for POST/PUT/PATCH requests only when there's data
            if (
                config.method === 'post' ||
        config.method === 'put' ||
        config.method === 'patch'
            ) {
                if (config.data !== undefined && config.data !== null) {
                    config.headers['Content-Type'] = 'application/json';
                } else {
                    // For requests without data, send an empty JSON object to avoid server errors
                    config.data = {};
                    config.headers['Content-Type'] = 'application/json';
                }
            }

            debug('Request:', config.method?.toUpperCase(), config.url);
            return config;
        });

        // Add response interceptor for error handling and ResponseObject format
        this.client.interceptors.response.use(
            (response) => {
                debug('Response:', response.status, response.config.url);

                // Handle ResponseObject format
                if (response.data && typeof response.data === 'object') {
                    const { status, statusCode, message } = response.data;

                    // If it's a ResponseObject, return it as-is for CLI to handle
                    if (status && statusCode && message !== undefined) {
                        return response;
                    }
                }

                return response;
            },
            (error) => {
                debug(
                    'Error:',
                    error.response?.status,
                    error.config?.url,
                    error.message,
                );
                return Promise.reject(this.formatError(error));
            },
        );
    }

    /**
   * Format API errors for better user experience
   */
    formatError(error) {
        if (error.response) {
            const { status, data } = error.response;

            // Handle ResponseObject error format
            if (data && data.status === 'error' && data.message) {
                return new Error(`API Error (${status}): ${data.message}`);
            }

            // Fallback to generic error handling
            const message = data?.message || data?.error || `HTTP ${status}`;
            return new Error(`API Error (${status}): ${message}`);
        } else if (error.request) {
            return new Error(
                `Network Error: Unable to connect to Canvas server at ${this.baseURL}`,
            );
        } else {
            return new Error(`Request Error: ${error.message}`);
        }
    }

    // Workspace API methods
    async getWorkspaces() {
        const response = await this.client.get('/workspaces');
        return response.data;
    }

    async getWorkspace(workspaceId) {
        const response = await this.client.get(`/workspaces/${workspaceId}`);
        return response.data;
    }

    async createWorkspace(workspaceData) {
        const response = await this.client.post('/workspaces', workspaceData);
        return response.data;
    }

    async updateWorkspace(workspaceId, workspaceData) {
        const response = await this.client.patch(
            `/workspaces/${workspaceId}`,
            workspaceData,
        );
        return response.data;
    }

    async deleteWorkspace(workspaceId) {
        const response = await this.client.delete(`/workspaces/${workspaceId}`);
        return response.data;
    }

    async startWorkspace(workspaceId) {
        const response = await this.client.post(`/workspaces/${workspaceId}/start`);
        return response.data;
    }

    async stopWorkspace(workspaceId) {
        const response = await this.client.post(`/workspaces/${workspaceId}/stop`);
        return response.data;
    }

    async openWorkspace(workspaceId) {
        const response = await this.client.post(`/workspaces/${workspaceId}/open`);
        return response.data;
    }

    async closeWorkspace(workspaceId) {
        const response = await this.client.post(`/workspaces/${workspaceId}/close`);
        return response.data;
    }

    async getWorkspaceStatus(workspaceId) {
        const response = await this.client.get(`/workspaces/${workspaceId}/status`);
        return response.data;
    }

    async getWorkspaceTree(workspaceId) {
        const response = await this.client.get(`/workspaces/${workspaceId}/tree`);
        return response.data;
    }

    // Context API methods
    async getContexts(options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);

        const url = `/contexts${params.toString() ? '?' + params.toString() : ''}`;
        const response = await this.client.get(url);
        return response.data;
    }

    async getContext(contextId) {
        const response = await this.client.get(`/contexts/${contextId}`);
        return response.data;
    }

    async createContext(contextData) {
        const response = await this.client.post('/contexts', contextData);
        return response.data;
    }

    async updateContext(contextId, contextData) {
        const response = await this.client.put(
            `/contexts/${contextId}`,
            contextData,
        );
        return response.data;
    }

    async deleteContext(contextId) {
        const response = await this.client.delete(`/contexts/${contextId}`);
        return response.data;
    }

    async getContextUrl(contextId) {
        const response = await this.client.get(`/contexts/${contextId}/url`);
        return response.data;
    }

    async setContextUrl(contextId, url) {
        const response = await this.client.post(`/contexts/${contextId}/url`, {
            url,
        });
        return response.data;
    }

    async getContextPath(contextId) {
        const response = await this.client.get(`/contexts/${contextId}/path`);
        return response.data;
    }

    async getContextPathArray(contextId) {
        const response = await this.client.get(`/contexts/${contextId}/path-array`);
        return response.data;
    }

    async getContextTree(contextId) {
        const response = await this.client.get(`/contexts/${contextId}/tree`);
        return response.data;
    }

    // Document API methods
    async getDocuments(containerId, containerType = 'context', options = {}) {
        const params = new URLSearchParams();
        if (options.featureArray && Array.isArray(options.featureArray)) {
            options.featureArray.forEach((feature) =>
                params.append('featureArray', feature),
            );
        }
        if (options.filterArray && Array.isArray(options.filterArray)) {
            options.filterArray.forEach((filter) =>
                params.append('filterArray', filter),
            );
        }
        if (options.includeServerContext)
            params.append('includeServerContext', 'true');
        if (options.includeClientContext)
            params.append('includeClientContext', 'true');
        if (options.limit) params.append('limit', options.limit);

        const baseUrl =
      containerType === 'context'
          ? `/contexts/${containerId}`
          : `/workspaces/${containerId}`;
        const url = `${baseUrl}/documents${params.toString() ? '?' + params.toString() : ''}`;
        const response = await this.client.get(url);
        return response.data;
    }

    async getDocument(containerId, documentId, containerType = 'context') {
        const baseUrl =
      containerType === 'context'
          ? `/contexts/${containerId}`
          : `/workspaces/${containerId}`;
        const response = await this.client.get(
            `${baseUrl}/documents/by-id/${documentId}`,
        );
        return response.data;
    }

    async createDocument(
        containerId,
        documentData,
        containerType = 'context',
        featureArray = [],
        contextSpec = null,
    ) {
        const baseUrl =
      containerType === 'context'
          ? `/contexts/${containerId}`
          : `/workspaces/${containerId}`;

        // Always append client/app/canvas-cli to the featureArray for CLI-created documents
        const enhancedFeatureArray = [...featureArray];
        if (!enhancedFeatureArray.includes('client/app/canvas-cli')) {
            enhancedFeatureArray.push('client/app/canvas-cli');
        }

        const payload = {
            documents: Array.isArray(documentData) ? documentData : [documentData],
            featureArray: enhancedFeatureArray,
        };
        if (contextSpec !== null && containerType === 'workspace') {
            payload.contextSpec = contextSpec;
        }
        const response = await this.client.post(`${baseUrl}/documents`, payload);
        return response.data;
    }

    async updateDocument(
        containerId,
        documentId,
        documentData,
        containerType = 'context',
    ) {
        const baseUrl =
      containerType === 'context'
          ? `/contexts/${containerId}`
          : `/workspaces/${containerId}`;
        const documents = Array.isArray(documentData)
            ? documentData
            : [{ id: documentId, ...documentData }];
        const response = await this.client.put(`${baseUrl}/documents`, {
            documents,
        });
        return response.data;
    }

    async deleteDocument(containerId, documentId, containerType = 'context') {
        const baseUrl =
      containerType === 'workspace'
          ? `/workspaces/${containerId}`
          : `/contexts/${containerId}`;
        const endpoint = `${baseUrl}/documents`;
        const documentIdArray = [documentId];

        const response = await this.client.delete(endpoint, {
            data: documentIdArray,
        });
        return response.data;
    }

    async deleteDocuments(containerId, documentIds, containerType = 'context') {
        const baseUrl =
      containerType === 'workspace'
          ? `/workspaces/${containerId}`
          : `/contexts/${containerId}`;
        const endpoint = `${baseUrl}/documents`;

        const response = await this.client.delete(endpoint, {
            data: documentIds,
        });
        return response.data;
    }

    async removeDocument(containerId, documentId, containerType = 'context') {
        const baseUrl =
      containerType === 'workspace'
          ? `/workspaces/${containerId}`
          : `/contexts/${containerId}`;
        const endpoint = `${baseUrl}/documents/remove`;
        const documentIdArray = [documentId];

        const response = await this.client.delete(endpoint, {
            data: documentIdArray,
        });
        return response.data;
    }

    async removeDocuments(containerId, documentIds, containerType = 'context') {
        const baseUrl =
      containerType === 'workspace'
          ? `/workspaces/${containerId}`
          : `/contexts/${containerId}`;
        const endpoint = `${baseUrl}/documents/remove`;

        const response = await this.client.delete(endpoint, {
            data: documentIds,
        });
        return response.data;
    }

    // Dotfile-specific API methods
    async getDotfiles(containerId, containerType = 'context', options = {}) {
        const params = new URLSearchParams();

        // Always include dotfile feature
        const featureArray = ['data/abstraction/dotfile', ...(options.featureArray || [])];
        featureArray.forEach((feature) => params.append('featureArray', feature));

        if (options.filterArray && Array.isArray(options.filterArray)) {
            options.filterArray.forEach((filter) =>
                params.append('filterArray', filter),
            );
        }
        if (options.includeServerContext)
            params.append('includeServerContext', 'true');
        if (options.includeClientContext)
            params.append('includeClientContext', 'true');
        if (options.limit) params.append('limit', options.limit);

        const baseUrl =
            containerType === 'context'
                ? `/contexts/${containerId}`
                : `/workspaces/${containerId}`;
        const url = `${baseUrl}/documents${params.toString() ? '?' + params.toString() : ''}`;
        const response = await this.client.get(url);
        return response.data;
    }

    async getDotfilesByWorkspace(workspaceId, options = {}) {
        return this.getDotfiles(workspaceId, 'workspace', options);
    }

    async getDotfilesByContext(contextId, options = {}) {
        return this.getDotfiles(contextId, 'context', options);
    }

    // Schema API methods
    async getSchemas() {
        const response = await this.client.get('/schemas');
        return response.data;
    }

    async getSchema(schemaName) {
        const response = await this.client.get(
            `/schemas/data/abstraction/${schemaName}`,
        );
        return response.data;
    }

    async getSchemaJson(schemaName) {
        const response = await this.client.get(
            `/schemas/data/abstraction/${schemaName}.json`,
        );
        return response.data;
    }

    // Auth API methods
    async login(credentials) {
    // Update to use email instead of username and match new API structure
        const loginData = {
            email: credentials.username || credentials.email,
            password: credentials.password,
            strategy: credentials.strategy || 'auto',
        };
        const response = await this.client.post('/auth/login', loginData);
        return response.data;
    }

    async logout() {
        const response = await this.client.post('/auth/logout');
        return response.data;
    }

    async getProfile() {
        const response = await this.client.get('/auth/me');
        return response.data;
    }

    async createApiToken(tokenData) {
        const response = await this.client.post('/auth/tokens', tokenData);
        return response.data;
    }

    async getApiTokens() {
        const response = await this.client.get('/auth/tokens');
        return response.data;
    }

    async deleteApiToken(tokenId) {
        const response = await this.client.delete(`/auth/tokens/${tokenId}`);
        return response.data;
    }

    // Health check
    async ping() {
        const response = await this.client.get('/ping');
        return response.data;
    }
}

/**
 * Canvas API Client that supports multi-remote resource addressing
 */
export class CanvasApiClient {
    constructor(config) {
        this.config = config;
        this.remoteStore = remoteStore;
        this.apiClients = new Map(); // Cache for API clients per remote
    }

    /**
   * Get or create an API client for a specific remote
   * @param {string} remoteId - Remote identifier (user@remote)
   * @returns {Promise<BaseCanvasApiClient>} API client for the remote
   */
    async getApiClient(remoteId) {
    // Check cache first
        if (this.apiClients.has(remoteId)) {
            return this.apiClients.get(remoteId);
        }

        // Get remote configuration
        const remote = await this.remoteStore.getRemote(remoteId);
        if (!remote) {
            throw new Error(
                `Remote '${remoteId}' not found. Add it with: canvas remote add ${remoteId} <url>`,
            );
        }

        // Create config-like object for the API client
        const remoteConfig = {
            get: (key) => {
                if (key === 'server.url') {
                    return remote.url + remote.apiBase;
                }
                if (key === 'server.auth.token') {
                    return remote.auth?.token || '';
                }
                return this.config.get(key);
            },
        };

        // Create and cache the API client
        const apiClient = new BaseCanvasApiClient(remoteConfig);
        this.apiClients.set(remoteId, apiClient);

        debug(`Created API client for remote: ${remoteId}`);
        return apiClient;
    }

    /**
   * Get the current default remote from session
   * @returns {Promise<string|null>} Default remote ID or null
   */
    async getCurrentRemote() {
        const session = await this.remoteStore.getSession();
        return session.boundRemote;
    }

    /**
   * Resolve a resource address to API client and resource identifier
   * @param {string} addressOrId - Resource address or simple ID (or alias)
   * @returns {Promise<{apiClient: BaseCanvasApiClient, resourceId: string, remoteId: string}>}
   */
    async resolveResource(addressOrId) {
        let remoteId;
        let resourceId;

        // First, try to resolve as alias
        const resolvedAddress = await this.remoteStore.resolveAlias(addressOrId);

        // Try to parse as resource address first
        const parsed = parseResourceAddress(resolvedAddress);
        if (parsed) {
            // Full address format: user@remote:resource
            remoteId = extractRemoteIdentifier(resolvedAddress);
            resourceId = parsed.resource;
        } else {
            // Simple ID format - use current/default remote
            resourceId = resolvedAddress;
            remoteId = await this.getCurrentRemote();

            if (!remoteId) {
                throw new Error(
                    'No default remote bound. Use: canvas remote bind <user@remote> or provide full address',
                );
            }
        }

        const apiClient = await this.getApiClient(remoteId);
        return { apiClient, resourceId, remoteId };
    }

    /**
   * Workspace operations with resource address support
   */

    async getWorkspaces(addressOrRemote = null) {
        let remoteId = addressOrRemote;

        if (!remoteId) {
            remoteId = await this.getCurrentRemote();
            if (!remoteId) {
                throw new Error(
                    'No default remote bound. Use: canvas remote bind <user@remote>',
                );
            }
        }

        // Check and perform auto-sync if needed
        await this.checkAndAutoSync(remoteId);

        const apiClient = await this.getApiClient(remoteId);
        const response = await apiClient.getWorkspaces();

        // Update local cache
        const workspaces = response.payload || response.data || response;
        if (Array.isArray(workspaces)) {
            for (const workspace of workspaces) {
                const workspaceKey = `${remoteId}:${workspace.id || workspace.name}`;
                await this.remoteStore.updateWorkspace(workspaceKey, workspace);
            }
        }

        return response;
    }

    async getWorkspace(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        const response = await apiClient.getWorkspace(resourceId);

        // Update local cache
        const workspace = response.payload || response.data || response;
        if (workspace) {
            const workspaceKey =
        extractResourceKey(addressOrId) ||
        `${await this.getCurrentRemote()}:${resourceId}`;
            await this.remoteStore.updateWorkspace(workspaceKey, workspace);
        }

        return response;
    }

    async createWorkspace(workspaceData, remoteId = null) {
        if (!remoteId) {
            remoteId = await this.getCurrentRemote();
            if (!remoteId) {
                throw new Error(
                    'No default remote bound. Use: canvas remote bind <user@remote>',
                );
            }
        }

        const apiClient = await this.getApiClient(remoteId);
        const response = await apiClient.createWorkspace(workspaceData);

        // Update local cache
        const workspace = response.payload || response.data || response;
        if (workspace) {
            const workspaceKey = `${remoteId}:${workspace.id || workspace.name}`;
            await this.remoteStore.updateWorkspace(workspaceKey, workspace);
        }

        return response;
    }

    async updateWorkspace(addressOrId, workspaceData) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        const response = await apiClient.updateWorkspace(resourceId, workspaceData);

        // Update local cache
        const workspace = response.payload || response.data || response;
        if (workspace) {
            const workspaceKey =
        extractResourceKey(addressOrId) ||
        `${await this.getCurrentRemote()}:${resourceId}`;
            await this.remoteStore.updateWorkspace(workspaceKey, workspace);
        }

        return response;
    }

    async deleteWorkspace(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        const response = await apiClient.deleteWorkspace(resourceId);

        // Remove from local cache
        const workspaceKey =
      extractResourceKey(addressOrId) ||
      `${await this.getCurrentRemote()}:${resourceId}`;
        await this.remoteStore.removeWorkspace(workspaceKey);

        return response;
    }

    async startWorkspace(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        return await apiClient.startWorkspace(resourceId);
    }

    async stopWorkspace(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        return await apiClient.stopWorkspace(resourceId);
    }

    async getWorkspaceTree(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        return await apiClient.getWorkspaceTree(resourceId);
    }

    async getWorkspaceStatus(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        return await apiClient.getWorkspaceStatus(resourceId);
    }

    async openWorkspace(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        return await apiClient.openWorkspace(resourceId);
    }

    async closeWorkspace(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        return await apiClient.closeWorkspace(resourceId);
    }

    /**
   * Context operations with resource address support
   */

    async getContexts(addressOrRemote = null) {
        let remoteId = addressOrRemote;

        if (!remoteId) {
            remoteId = await this.getCurrentRemote();
            if (!remoteId) {
                throw new Error(
                    'No default remote bound. Use: canvas remote bind <user@remote>',
                );
            }
        }

        // Check and perform auto-sync if needed
        await this.checkAndAutoSync(remoteId);

        const apiClient = await this.getApiClient(remoteId);
        const response = await apiClient.getContexts();

        // Update local cache
        const contexts = response.payload || response.data || response;
        if (Array.isArray(contexts)) {
            for (const context of contexts) {
                const contextKey = `${remoteId}:${context.id}`;
                await this.remoteStore.updateContext(contextKey, context);
            }
        }

        return response;
    }

    async getContext(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        const response = await apiClient.getContext(resourceId);

        // Update local cache
        const context = response.payload || response.data || response;
        if (context) {
            const contextKey =
        extractResourceKey(addressOrId) ||
        `${await this.getCurrentRemote()}:${resourceId}`;
            await this.remoteStore.updateContext(contextKey, context);
        }

        return response;
    }

    async createContext(contextData, remoteId = null) {
        if (!remoteId) {
            remoteId = await this.getCurrentRemote();
            if (!remoteId) {
                throw new Error(
                    'No default remote bound. Use: canvas remote bind <user@remote>',
                );
            }
        }

        const apiClient = await this.getApiClient(remoteId);
        const response = await apiClient.createContext(contextData);

        // Update local cache
        const context = response.payload || response.data || response;
        if (context) {
            const contextKey = `${remoteId}:${context.id}`;
            await this.remoteStore.updateContext(contextKey, context);
        }

        return response;
    }

    async updateContext(addressOrId, contextData) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        const response = await apiClient.updateContext(resourceId, contextData);

        // Update local cache
        const context = response.payload || response.data || response;
        if (context) {
            const contextKey =
        extractResourceKey(addressOrId) ||
        `${await this.getCurrentRemote()}:${resourceId}`;
            await this.remoteStore.updateContext(contextKey, context);
        }

        return response;
    }

    async deleteContext(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        const response = await apiClient.deleteContext(resourceId);

        // Remove from local cache
        const contextKey =
      extractResourceKey(addressOrId) ||
      `${await this.getCurrentRemote()}:${resourceId}`;
        await this.remoteStore.removeContext(contextKey);

        return response;
    }

    /**
   * Document operations with resource address support
   */

    async getDocuments(
        containerAddressOrId,
        containerType = 'context',
        options = {},
    ) {
        const { apiClient, resourceId } =
      await this.resolveResource(containerAddressOrId);
        return await apiClient.getDocuments(resourceId, containerType, options);
    }

    async getDocument(
        containerAddressOrId,
        documentId,
        containerType = 'context',
    ) {
        const { apiClient, resourceId } =
      await this.resolveResource(containerAddressOrId);
        return await apiClient.getDocument(resourceId, documentId, containerType);
    }

    async createDocument(
        containerAddressOrId,
        documentData,
        containerType = 'context',
        featureArray = [],
        contextSpec = null,
    ) {
        const { apiClient, resourceId } =
      await this.resolveResource(containerAddressOrId);
        return await apiClient.createDocument(
            resourceId,
            documentData,
            containerType,
            featureArray,
            contextSpec,
        );
    }

    async updateDocument(
        containerAddressOrId,
        documentId,
        documentData,
        containerType = 'context',
    ) {
        const { apiClient, resourceId } =
      await this.resolveResource(containerAddressOrId);
        return await apiClient.updateDocument(
            resourceId,
            documentId,
            documentData,
            containerType,
        );
    }

    async deleteDocument(
        containerAddressOrId,
        documentId,
        containerType = 'context',
    ) {
        const { apiClient, resourceId } =
      await this.resolveResource(containerAddressOrId);
        return await apiClient.deleteDocument(
            resourceId,
            documentId,
            containerType,
        );
    }

    async deleteDocuments(
        containerAddressOrId,
        documentIds,
        containerType = 'context',
    ) {
        const { apiClient, resourceId } =
      await this.resolveResource(containerAddressOrId);
        return await apiClient.deleteDocuments(
            resourceId,
            documentIds,
            containerType,
        );
    }

    async removeDocument(
        containerAddressOrId,
        documentId,
        containerType = 'context',
    ) {
        const { apiClient, resourceId } =
      await this.resolveResource(containerAddressOrId);
        return await apiClient.removeDocument(
            resourceId,
            documentId,
            containerType,
        );
    }

    async removeDocuments(
        containerAddressOrId,
        documentIds,
        containerType = 'context',
    ) {
        const { apiClient, resourceId } =
      await this.resolveResource(containerAddressOrId);
        return await apiClient.removeDocuments(
            resourceId,
            documentIds,
            containerType,
        );
    }

    /**
   * Context URL operations with resource address support
   */

    async getContextUrl(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        return await apiClient.getContextUrl(resourceId);
    }

    async setContextUrl(addressOrId, url) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        return await apiClient.setContextUrl(resourceId, url);
    }

    async getContextPath(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        return await apiClient.getContextPath(resourceId);
    }

    async getContextPathArray(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        return await apiClient.getContextPathArray(resourceId);
    }

    async getContextTree(addressOrId) {
        const { apiClient, resourceId } = await this.resolveResource(addressOrId);
        return await apiClient.getContextTree(resourceId);
    }

    /**
   * Utility methods
   */

    async ping(remoteId = null) {
        if (!remoteId) {
            remoteId = await this.getCurrentRemote();
            if (!remoteId) {
                throw new Error(
                    'No default remote bound. Use: canvas remote bind <user@remote>',
                );
            }
        }

        const apiClient = await this.getApiClient(remoteId);
        return await apiClient.ping();
    }

    /**
     * Check if a remote is reachable
     * @param {string} remoteId - Remote identifier, if null uses current remote
     * @returns {Promise<boolean>} True if remote is reachable, false otherwise
     */
    async isRemoteReachable(remoteId = null) {
        try {
            await this.ping(remoteId);
            return true;
        } catch (error) {
            debug(`Remote '${remoteId || 'current'}' is not reachable:`, error.message);
            return false;
        }
    }

    /**
   * Check if remote needs syncing and perform auto-sync if enabled
   * @param {string} remoteId - Remote identifier
   * @returns {Promise<boolean>} True if sync was performed
   */
    async checkAndAutoSync(remoteId) {
        try {
            // Get sync configuration
            const syncConfig = this.config.get('sync') || {};
            if (!syncConfig.enabled) {
                return false;
            }

            const staleThreshold = syncConfig.staleThreshold || 15; // minutes

            // Get remote configuration
            const remote = await this.remoteStore.getRemote(remoteId);
            if (!remote) {
                return false;
            }

            // Check if remote needs syncing
            if (!remote.lastSynced) {
                debug(`Remote '${remoteId}' has never been synced, performing sync...`);
                return await this.performAutoSync(remoteId);
            }

            const lastSyncTime = new Date(remote.lastSynced).getTime();
            const now = Date.now();
            const minutesSinceSync = (now - lastSyncTime) / (1000 * 60);

            if (minutesSinceSync > staleThreshold) {
                debug(
                    `Remote '${remoteId}' last synced ${Math.round(minutesSinceSync)} minutes ago, performing sync...`,
                );
                return await this.performAutoSync(remoteId);
            }

            return false;
        } catch (error) {
            debug(`Auto-sync check failed for remote '${remoteId}':`, error.message);
            return false;
        }
    }

    /**
   * Perform automatic sync for a remote
   * @param {string} remoteId - Remote identifier
   * @returns {Promise<boolean>} True if sync was successful
   */
    async performAutoSync(remoteId) {
        try {
            const apiClient = await this.getApiClient(remoteId);

            // Test connection first
            await apiClient.ping();

            // Sync workspaces
            try {
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
                }
            } catch (error) {
                debug(`Failed to sync workspaces for '${remoteId}':`, error.message);
            }

            // Sync contexts
            try {
                const contextsResponse = await apiClient.getContexts();
                const contexts =
          contextsResponse.payload || contextsResponse.data || contextsResponse;

                if (Array.isArray(contexts)) {
                    for (const context of contexts) {
                        const contextKey = `${remoteId}:${context.id}`;
                        await this.remoteStore.updateContext(contextKey, context);
                    }
                }
            } catch (error) {
                debug(`Failed to sync contexts for '${remoteId}':`, error.message);
            }

            // Update last synced timestamp
            await this.remoteStore.updateRemote(remoteId, {
                lastSynced: new Date().toISOString(),
            });

            debug(`Auto-sync completed for remote '${remoteId}'`);
            return true;
        } catch (error) {
            debug(`Auto-sync failed for remote '${remoteId}':`, error.message);
            return false;
        }
    }

    /**
   * Get cached resources from local storage
   */

    async getCachedWorkspaces(remoteId = null) {
        const workspaces = await this.remoteStore.getWorkspaces();

        if (remoteId) {
            const filtered = {};
            const prefix = `${remoteId}:`;
            for (const [key, workspace] of Object.entries(workspaces)) {
                if (key.startsWith(prefix)) {
                    filtered[key] = workspace;
                }
            }
            return filtered;
        }

        return workspaces;
    }

    async getCachedContexts(remoteId = null) {
        const contexts = await this.remoteStore.getContexts();

        if (remoteId) {
            const filtered = {};
            const prefix = `${remoteId}:`;
            for (const [key, context] of Object.entries(contexts)) {
                if (key.startsWith(prefix)) {
                    filtered[key] = context;
                }
            }
            return filtered;
        }

        return contexts;
    }

    /**
     * Sync remote data and update local index for a specific remote
     * @param {string} remoteId - Remote identifier, if null uses current remote
     * @param {Object} options - Sync options
     * @param {boolean} options.contexts - Whether to sync contexts (default: true)
     * @param {boolean} options.workspaces - Whether to sync workspaces (default: true)
     * @param {boolean} options.silent - Whether to suppress output (default: true)
     * @returns {Promise<boolean>} True if sync was successful
     */
    async syncRemoteAndUpdateIndex(remoteId = null, options = {}) {
        const {
            contexts = true,
            workspaces = true,
            silent = true
        } = options;

        try {
            if (!remoteId) {
                remoteId = await this.getCurrentRemote();
                if (!remoteId) {
                    debug('No default remote bound for sync');
                    return false;
                }
            }

            // Check if remote is reachable first
            if (!(await this.isRemoteReachable(remoteId))) {
                debug(`Remote '${remoteId}' is not reachable for sync`);
                return false;
            }

            const apiClient = await this.getApiClient(remoteId);

            if (!silent) {
                console.log(`Updating local index from remote '${remoteId}'...`);
            }

            let syncSuccess = true;

            // Sync workspaces if requested
            if (workspaces) {
                try {
                    const workspacesResponse = await apiClient.getWorkspaces();
                    const workspaceData = workspacesResponse.payload || workspacesResponse.data || workspacesResponse;
                    
                    if (Array.isArray(workspaceData)) {
                        const fetchedKeys = new Set();
                        for (const workspace of workspaceData) {
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
                        
                        debug(`Synced ${workspaceData.length} workspaces for remote '${remoteId}'`);
                    }
                } catch (error) {
                    debug(`Failed to sync workspaces for remote '${remoteId}':`, error.message);
                    syncSuccess = false;
                }
            }

            // Sync contexts if requested
            if (contexts) {
                try {
                    const contextsResponse = await apiClient.getContexts();
                    const contextData = contextsResponse.payload || contextsResponse.data || contextsResponse;
                    
                    if (Array.isArray(contextData)) {
                        const fetchedContextKeys = new Set();
                        for (const context of contextData) {
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
                        
                        debug(`Synced ${contextData.length} contexts for remote '${remoteId}'`);
                    }
                } catch (error) {
                    debug(`Failed to sync contexts for remote '${remoteId}':`, error.message);
                    syncSuccess = false;
                }
            }

            // Update last synced timestamp if any sync was successful
            if (syncSuccess) {
                await this.remoteStore.updateRemote(remoteId, {
                    lastSynced: new Date().toISOString()
                });
            }

            if (!silent && syncSuccess) {
                console.log(`✓ Local index updated from remote '${remoteId}'`);
            }

            return syncSuccess;
        } catch (error) {
            debug(`Failed to sync remote '${remoteId}':`, error.message);
            return false;
        }
    }

    /**
     * Clear API client cache (useful after remote configuration changes)
     */
    clearCache() {
        this.apiClients.clear();
        debug('Cleared API client cache');
    }

    // Dotfile-specific API methods that delegate to appropriate remote client
    async getDotfiles(containerAddressOrId, containerType = 'context', options = {}) {
        const { apiClient, resourceId } = await this.resolveResource(containerAddressOrId);
        return apiClient.getDotfiles(resourceId, containerType, options);
    }

    async getDotfilesByWorkspace(workspaceAddressOrId, options = {}) {
        const { apiClient, resourceId } = await this.resolveResource(workspaceAddressOrId);
        return apiClient.getDotfilesByWorkspace(resourceId, options);
    }

    async getDotfilesByContext(contextAddressOrId, options = {}) {
        const { apiClient, resourceId } = await this.resolveResource(contextAddressOrId);
        return apiClient.getDotfilesByContext(resourceId, options);
    }
}

export default CanvasApiClient;

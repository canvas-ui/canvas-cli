'use strict';

import { setupDebug } from '../lib/debug.js';

const debug = setupDebug('canvas:cli:address-parser');

/**
 * Canvas Resource Address Parser
 *
 * Handles parsing and validation of Canvas resource addresses in the format:
 * [user.name]@[remote-or-remote-alias]:[resource][optional path]
 *
 * Examples:
 * - userfoo@canvas.local:workspace1
 * - userbar@canvas.remote:context-foo
 * - userbaz@work.tld:workspace-baz/shell/bash
 * - userbas@workmachine:workspace-baf/foo/bar/baf
 */

/**
 * Parse a Canvas resource address
 * @param {string} address - The resource address to parse
 * @returns {Object|null} Parsed address object or null if invalid
 */
export function parseResourceAddress(address) {
    if (!address || typeof address !== 'string') {
        debug('Invalid address: not a string or empty');
        return null;
    }

    // Pattern: [user.name]@[remote]:[resource][/optional/path]
    const addressRegex = /^([^@]+)@([^:]+):([^/]+)(.*)$/;
    const match = address.match(addressRegex);

    if (!match) {
        debug('Invalid address format:', address);
        return null;
    }

    const [, userIdentifier, remote, resource, optionalPath] = match;

    // Validate components
    if (!userIdentifier.trim() || !remote.trim() || !resource.trim()) {
        debug('Invalid address: empty components');
        return null;
    }

    const parsed = {
        userIdentifier: userIdentifier.trim(),
        remote: remote.trim(),
        resource: resource.trim(),
        path: optionalPath || '',
        full: address,
        isLocal: isLocalRemote(remote.trim()),
        isRemote: !isLocalRemote(remote.trim()),
    };

    // Determine resource type
    parsed.resourceType = determineResourceType(parsed.resource);

    debug('Parsed address:', parsed);
    return parsed;
}

/**
 * Construct a Canvas resource address
 * @param {string} userIdentifier - User identifier
 * @param {string} remote - Remote name or alias
 * @param {string} resource - Resource identifier
 * @param {string} [path=''] - Optional path
 * @returns {string} Constructed address
 */
export function constructResourceAddress(
    userIdentifier,
    remote,
    resource,
    path = '',
) {
    if (!userIdentifier || !remote || !resource) {
        throw new Error('userIdentifier, remote, and resource are required');
    }

    const address = `${userIdentifier}@${remote}:${resource}${path}`;
    debug('Constructed address:', address);
    return address;
}

/**
 * Parse a remote identifier (user@remote)
 * @param {string} remoteId - Remote identifier
 * @returns {Object|null} Parsed remote object or null if invalid
 */
export function parseRemoteIdentifier(remoteId) {
    if (!remoteId || typeof remoteId !== 'string') {
        return null;
    }

    const parts = remoteId.split('@');
    if (parts.length !== 2) {
        return null;
    }

    const [userIdentifier, remote] = parts;
    if (!userIdentifier.trim() || !remote.trim()) {
        return null;
    }

    return {
        userIdentifier: userIdentifier.trim(),
        remote: remote.trim(),
        full: remoteId,
        isLocal: isLocalRemote(remote.trim()),
    };
}

/**
 * Construct a remote identifier
 * @param {string} userIdentifier - User identifier
 * @param {string} remote - Remote name
 * @returns {string} Remote identifier
 */
export function constructRemoteIdentifier(userIdentifier, remote) {
    if (!userIdentifier || !remote) {
        throw new Error('userIdentifier and remote are required');
    }
    return `${userIdentifier}@${remote}`;
}

/**
 * Extract the remote identifier from a resource address
 * @param {string} address - Resource address
 * @returns {string|null} Remote identifier or null
 */
export function extractRemoteIdentifier(address) {
    const parsed = parseResourceAddress(address);
    if (!parsed) {
        return null;
    }
    return constructRemoteIdentifier(parsed.userIdentifier, parsed.remote);
}

/**
 * Extract the resource key for local storage
 * @param {string} address - Resource address
 * @returns {string|null} Resource key for local storage or null
 */
export function extractResourceKey(address) {
    const parsed = parseResourceAddress(address);
    if (!parsed) {
        return null;
    }

    const remoteId = constructRemoteIdentifier(
        parsed.userIdentifier,
        parsed.remote,
    );
    return `${remoteId}:${parsed.resource}`;
}

/**
 * Check if a remote is considered local
 * @param {string} remote - Remote name
 * @returns {boolean} True if remote is local
 */
export function isLocalRemote(remote) {
    const localRemotes = [
        'canvas.local',
        'local',
        'localhost',
        '127.0.0.1',
        '::1',
    ];
    return localRemotes.includes(remote.toLowerCase());
}

/**
 * Determine resource type from resource identifier
 * @param {string} resource - Resource identifier
 * @returns {string} Resource type (workspace, context, unknown)
 */
export function determineResourceType(resource) {
    // Simple heuristics - could be enhanced with patterns or prefixes
    if (resource.includes('workspace') || resource.match(/^ws-/)) {
        return 'workspace';
    }
    if (
        resource.includes('context') ||
    resource.includes('ctx') ||
    resource.match(/^ctx-/)
    ) {
        return 'context';
    }

    // Default to context for simple identifiers
    return 'context';
}

/**
 * Validate a resource address format
 * @param {string} address - Resource address to validate
 * @returns {boolean} True if valid format
 */
export function isValidResourceAddress(address) {
    return parseResourceAddress(address) !== null;
}

/**
 * Normalize a resource address (ensure consistent format)
 * @param {string} address - Resource address to normalize
 * @returns {string|null} Normalized address or null if invalid
 */
export function normalizeResourceAddress(address) {
    const parsed = parseResourceAddress(address);
    if (!parsed) {
        return null;
    }
    return constructResourceAddress(
        parsed.userIdentifier,
        parsed.remote,
        parsed.resource,
        parsed.path,
    );
}

/**
 * Split resource path into components
 * @param {string} path - Resource path (e.g., /shell/bash)
 * @returns {Array<string>} Path components
 */
export function splitResourcePath(path) {
    if (!path || path === '/') {
        return [];
    }
    return path.split('/').filter((component) => component.length > 0);
}

/**
 * Join path components into resource path
 * @param {Array<string>} components - Path components
 * @returns {string} Resource path
 */
export function joinResourcePath(components) {
    if (!Array.isArray(components) || components.length === 0) {
        return '';
    }
    return '/' + components.join('/');
}

/**
 * Get the base resource address (without path)
 * @param {string} address - Full resource address
 * @returns {string|null} Base address or null if invalid
 */
export function getBaseResourceAddress(address) {
    const parsed = parseResourceAddress(address);
    if (!parsed) {
        return null;
    }
    return constructResourceAddress(
        parsed.userIdentifier,
        parsed.remote,
        parsed.resource,
    );
}

export default {
    parseResourceAddress,
    constructResourceAddress,
    parseRemoteIdentifier,
    constructRemoteIdentifier,
    extractRemoteIdentifier,
    extractResourceKey,
    isLocalRemote,
    determineResourceType,
    isValidResourceAddress,
    normalizeResourceAddress,
    splitResourcePath,
    joinResourcePath,
    getBaseResourceAddress,
};

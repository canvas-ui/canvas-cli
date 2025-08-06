'use strict';

import path from 'path';
import { CANVAS_DIR_DATA } from './config.js';

/**
 * Data types that can be stored per workspace
 */
export const DATA_TYPES = {
    DOTFILES: 'dotfiles',
    FILES: 'files',
    AGENTS: 'agents',
    ROLES: 'roles'
};

/**
 * Get local workspace data directory for a specific data type
 * @param {Object} address - Parsed resource address
 * @param {string} dataType - Type of data (dotfiles, files, agents, roles)
 * @returns {string} Path to the workspace data directory
 */
export function getWorkspaceDataDir(address, dataType) {
    const remoteKey = `${address.userIdentifier}@${address.remote}`;
    return path.join(CANVAS_DIR_DATA, remoteKey, address.resource, dataType);
}

/**
 * Get all possible data directories for a workspace
 * @param {Object} address - Parsed resource address
 * @returns {Object} Object with data type keys and directory paths as values
 */
export function getWorkspaceDataDirs(address) {
    const dirs = {};
    for (const [key, dataType] of Object.entries(DATA_TYPES)) {
        dirs[key.toLowerCase()] = getWorkspaceDataDir(address, dataType);
    }
    return dirs;
}

/**
 * Get the base workspace directory (contains all data type subdirectories)
 * @param {Object} address - Parsed resource address
 * @returns {string} Path to the base workspace directory
 */
export function getWorkspaceBaseDir(address) {
    const remoteKey = `${address.userIdentifier}@${address.remote}`;
    return path.join(CANVAS_DIR_DATA, remoteKey, address.resource);
}

/**
 * Get the remote base directory (contains all workspaces for a remote)
 * @param {Object} address - Parsed resource address
 * @returns {string} Path to the remote base directory
 */
export function getRemoteBaseDir(address) {
    const remoteKey = `${address.userIdentifier}@${address.remote}`;
    return path.join(CANVAS_DIR_DATA, remoteKey);
}

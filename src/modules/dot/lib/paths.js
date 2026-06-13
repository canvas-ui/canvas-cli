'use strict';

import { join } from 'node:path';
import { DIR_DATA } from '../../../core/paths.js';
import { config } from '../../../core/storage.js';

// Local workspace git clone:
//   ~/.canvas/data/{user@remote}/workspaces/{workspaceId}/git/
export function localRepoDir({ remoteId, id }) {
    return join(DIR_DATA, remoteId, 'workspaces', id, 'git');
}

export function dotfilesDir(handle) {
    return join(localRepoDir(handle), config.get('dotfilesDir') || 'dotfiles');
}

export function hooksDir(handle) {
    return join(localRepoDir(handle), config.get('hooksDir') || 'hooks');
}

export function repoFilePath(handle, repoPath) {
    return join(dotfilesDir(handle), repoPath);
}

// Backend git HTTP URL for clone/push/pull:
//   {remoteUrl}/rest/v2/workspaces/{ws}/git
export function gitUrl({ api, id }) {
    const base = api.http.defaults.baseURL.replace(/\/$/, '');
    return `${base}/workspaces/${id}/git`;
}

export function gitUrlWithAuth(handle) {
    const url = gitUrl(handle);
    const token = handle.api.token();
    if (!token) return url;
    return url.replace('://', `://user:${encodeURIComponent(token)}@`);
}

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
//
// Reads baseUrl/apiBase off the client. It used to read
// `api.http.defaults.baseURL`, an axios property that stopped existing when
// the client moved to fetch — which silently killed every dot command that
// touches the repo (add, clone, push, pull) with "Cannot read properties of
// undefined (reading 'defaults')".
export function gitUrl({ api, id }) {
    const base = `${api.baseUrl}${api.apiBase}`.replace(/\/$/, '');
    return `${base}/workspaces/${id}/git`;
}

export function gitUrlWithAuth(handle) {
    const url = gitUrl(handle);
    const token = handle.api.token();
    if (!token) return url;
    return url.replace('://', `://user:${encodeURIComponent(token)}@`);
}

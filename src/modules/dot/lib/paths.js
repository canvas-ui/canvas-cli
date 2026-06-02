'use strict';

import { join } from 'node:path';
import { DIR_DATA } from '../../../core/paths.js';

// Local working clone path:
//   ~/.canvas/data/{user@remote}/workspaces/{workspaceId}/dotfiles/
export function localRepoDir({ remoteId, id }) {
    return join(DIR_DATA, remoteId, 'workspaces', id, 'dotfiles');
}

export function repoFilePath(handle, repoPath) {
    return join(localRepoDir(handle), repoPath);
}

// Backend git HTTP URL for clone/push/pull:
//   {remoteUrl}/rest/v2/workspaces/{ws}/dotfiles/git
export function gitUrl({ api, id }) {
    const base = api.http.defaults.baseURL.replace(/\/$/, '');
    return `${base}/workspaces/${id}/dotfiles/git`;
}

export function gitUrlWithAuth(handle) {
    const url = gitUrl(handle);
    const token = handle.api.token();
    if (!token) return url;
    return url.replace('://', `://user:${encodeURIComponent(token)}@`);
}

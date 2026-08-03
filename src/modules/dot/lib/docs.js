'use strict';

// Helpers for working with dotfile documents returned by the server.
// Backend schema (Dotfile v3.0):
//   doc.data = { url, type, links: {deviceId: localPath}, description, tags, priority }
//
// v3 replaced `repoPath` with `url`, a normalized identity URI naming which entry
// in WHICH repo (`workspace:dotfiles#shell/bashrc`, or a git+ssh:// external
// repo). The CLI keeps talking to users in repo paths — that is the common case
// and nobody should have to type a URI — so the conversion happens here, at the
// boundary, and the action code stays unchanged.

const WORKSPACE_REPO = 'workspace:dotfiles';

/** Repo-relative entry path out of a dotfile identity URI. */
export function entryPath(doc) {
    const url = doc?.data?.url;
    if (typeof url !== 'string') return null;
    const hash = url.indexOf('#');
    return hash < 0 ? null : (url.slice(hash + 1) || null);
}

/** A user-supplied repo path -> the workspace-local identity URI. */
export function toWorkspaceUrl(repoPath) {
    return `${WORKSPACE_REPO}#${String(repoPath).replace(/^\/+/, '')}`;
}

export function unpack(doc) {
    if (!doc) return null;
    if (doc.data && doc.data.url) return doc;
    return null;
}

export function findByRepoPath(docs, repoPath) {
    const list = Array.isArray(docs) ? docs : docs?.documents || [];
    // Match on the entry path so a user can name it however they normally would;
    // the server has already normalized the stored URL.
    const wanted = String(repoPath || '').replace(/^\/+/, '').replace(/\/+$/, '');
    return list.find((d) => entryPath(d) === wanted) || null;
}

export function localForDevice(doc, deviceId) {
    return doc?.data?.links?.[deviceId] || null;
}

export function deviceCount(doc) {
    return Object.keys(doc?.data?.links || {}).length;
}

export function summarize(doc, deviceId) {
    const d = doc.data;
    return {
        id: doc.id,
        repoPath: entryPath(doc),
        type: d.type,
        devices: deviceCount(doc),
        localHere: d.links?.[deviceId] || null,
        tags: (d.tags || []).join(','),
    };
}

'use strict';

// Helpers for working with dotfile documents returned by the server.
// Backend schema (Dotfile v3.1):
//   doc.data = { repoPath, type, links: {deviceId: localPath}, description, tags, priority }

export function unpack(doc) {
    if (!doc) return null;
    if (doc.data && doc.data.repoPath) return doc;
    return null;
}

export function findByRepoPath(docs, repoPath) {
    const list = Array.isArray(docs) ? docs : docs?.documents || [];
    return list.find((d) => d?.data?.repoPath === repoPath) || null;
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
        repoPath: d.repoPath,
        type: d.type,
        devices: deviceCount(doc),
        localHere: d.links?.[deviceId] || null,
        tags: (d.tags || []).join(','),
    };
}

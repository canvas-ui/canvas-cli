'use strict';

export function buildNoteDoc(content, title) {
    const doc = {
        schema: 'data/abstraction/note',
        schemaVersion: '2.0',
        data: { content },
    };
    if (title) doc.data.title = title;
    return doc;
}

export function buildTabDoc(url, { title } = {}) {
    const doc = {
        schema: 'data/abstraction/tab',
        schemaVersion: '2.0',
        data: { url },
    };
    if (title) doc.data.title = title;
    return doc;
}

export function tagsToFeatures(tags) {
    const list = Array.isArray(tags) ? tags : (tags ? [tags] : []);
    return list.filter(Boolean).map(t => `custom/tag/${t}`);
}

export function parseTargets(flags) {
    const rawCtx = flags.context;
    const contextPaths = rawCtx
        ? (Array.isArray(rawCtx) ? rawCtx : [rawCtx])
        : [];
    const dirPath = flags.directory || null;
    const targets = [];
    for (const cp of contextPaths) targets.push({ context: cp, treeType: 'context' });
    if (dirPath) targets.push({ context: dirPath, treeType: 'directory' });
    if (targets.length === 0) targets.push({ context: '/', treeType: 'context' });
    return targets;
}

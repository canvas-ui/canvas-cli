'use strict';

export function buildListDocumentsParams(opts = {}) {
    const params = {};
    if (opts.q) params.q = opts.q;
    if (opts.search) params.search = opts.search;
    if (opts.context) params.context = opts.context;
    if (opts.treeNameOrTreeId) params.treeNameOrTreeId = opts.treeNameOrTreeId;
    if (opts.treeType) params.treeType = opts.treeType;
    const features = opts.feature != null ? [].concat(opts.feature).filter(Boolean) : [];
    if (features.length) params.allOf = features;
    const filters = opts.filter != null ? [].concat(opts.filter).filter(Boolean) : [];
    if (filters.length) params.filters = filters;
    // Only ever sent to turn the context's saved view OFF; omitted means "fold
    // it in", which is what a bound client wants by default.
    if (opts.applyContextSpec === false) params.applyContextSpec = false;
    return params;
}

export function normalizeDocumentList(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return [...payload];
    if (Array.isArray(payload?.documents)) return payload.documents;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

export function displayTree(io, node, prefix = '', isLast = true) {
    if (!node) return;
    const connector = isLast ? '└── ' : '├── ';
    const name = node.label || node.name || node.id || '?';
    const badge = node.type === 'universe' ? '[UNIVERSE]' : '';
    io.print(`${prefix}${connector}${name}${badge ? ' ' + badge : ''}`);
    if (Array.isArray(node.children)) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        node.children.forEach((child, i) => {
            displayTree(io, child, childPrefix, i === node.children.length - 1);
        });
    }
}

export function extractPaths(node, current = '') {
    const paths = [];
    if (!node) return paths;
    const name = node.label || node.name || node.id;
    let p = current;
    if (name && name !== '/' && name !== '' && node.type !== 'universe') {
        p = current === '' ? `/${name}` : `${current}/${name}`;
    }
    if (p && p !== '/' && node.type !== 'universe') paths.push(p);
    if (Array.isArray(node.children)) {
        for (const child of node.children) paths.push(...extractPaths(child, p));
    }
    return paths;
}

export function unwrapResource(payload, key) {
    if (!payload) return payload;
    if (payload[key]) return payload[key];
    return payload;
}

/**
 * A context can carry a saved view — the toolbox filters the web persists onto
 * it (`features.anyOf`, `filters`). The server folds that into every listing
 * unless `applyContextSpec=false`, so a context whose saved view matches
 * nothing lists as empty while holding hundreds of documents. Rendering the
 * spec is how the CLI explains that instead of printing a bare `(empty)`.
 *
 * @returns {string|null} e.g. `any: note, text` — null when nothing is saved
 */
export function describeContextSpec(context) {
    if (!context) return null;
    const f = context.features || {};
    const short = (v) => String(v).replace(/^data\/(schema|mime)\//, '');
    const parts = [];
    for (const [key, label] of [['allOf', 'all'], ['anyOf', 'any'], ['noneOf', 'none']]) {
        const list = Array.isArray(f[key]) ? f[key].filter(Boolean) : [];
        if (list.length) parts.push(`${label}: ${list.map(short).join(', ')}`);
    }
    const filters = Array.isArray(context.filters) ? context.filters.filter(Boolean) : [];
    if (filters.length) parts.push(`filters: ${filters.join(', ')}`);
    return parts.length ? parts.join(' · ') : null;
}

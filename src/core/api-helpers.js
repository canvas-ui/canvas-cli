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

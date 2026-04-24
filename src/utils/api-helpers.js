'use strict';

/**
 * Query params for GET .../documents (workspace or context SynapsD list/search).
 * Server expects `allOf` / `noneOf` / `anyOf`, `filters`, `context`, `treeNameOrTreeId`, `q` / `search`.
 */
export function buildListDocumentsParams(options = {}) {
    const params = {};
    if (options.q) params.q = options.q;
    if (options.search) params.search = options.search;
    if (options.context) params.context = options.context;
    if (options.treeNameOrTreeId) params.treeNameOrTreeId = options.treeNameOrTreeId;
    if (options.treeType) params.treeType = options.treeType;

    const features = options.feature != null ? [].concat(options.feature).filter(Boolean) : [];
    if (features.length) params.allOf = features;

    const filters = options.filter != null ? [].concat(options.filter).filter(Boolean) : [];
    if (filters.length) params.filters = filters;

    return params;
}

/** Normalize list payload from ResponseObject `payload` (array or array-like). */
export function normalizeDocumentList(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return [...payload];
    if (Array.isArray(payload?.documents)) return payload.documents;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

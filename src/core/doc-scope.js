'use strict';

import { routes } from '@augmentd-labs/canvas-protocol';
import { buildListDocumentsParams, normalizeDocumentList, describeContextSpec } from './api-helpers.js';

/**
 * The container a document noun operates on — a context or a workspace —
 * behind one interface, so every verb in the noun factory is written once.
 *
 * The two differ in more than their URL: a workspace insert can target tree
 * paths (`--path notes:/inbox`), a context insert cannot — a context already
 * IS a path, which is why the context ingest actions have always passed
 * `useTargets: false`.
 *
 * @param {Object} ctx the action run() context
 * @param {'context'|'workspace'} kind
 */
export async function docScope(ctx, kind) {
    const { handle, api, id } = await resolveHandle(ctx, kind);
    const r = kind === 'context' ? routes.contexts : routes.workspaces;

    return {
        kind,
        handle,
        id,

        list: async (opts) => {
            const params = buildListDocumentsParams(opts);
            const payload = kind === 'context'
                ? await api.contexts.documents(id, params)
                : await api.workspaces.documents(id, params);
            return normalizeDocumentList(payload);
        },

        /**
         * The saved view folded into every list here, as a one-line summary —
         * or null when there is none (a workspace never has one).
         */
        savedView: async () => {
            if (kind !== 'context') return null;
            const c = await api.contexts.get(id);
            return describeContextSpec(c?.context || c?.payload || c);
        },

        get: async (docId) => {
            const d = kind === 'context'
                ? await api.get(r.document(id, docId))
                : await api.get(`${r.documents(id)}/${encodeURIComponent(docId)}`);
            return d?.document || d?.payload || d;
        },

        insert: async (documents, features, extra = {}) => {
            const body = { documents, features, ...extra };
            return kind === 'context'
                ? api.contexts.insertDocuments(id, body)
                : api.workspaces.insertDocuments(id, body);
        },

        /** Soft: the document stays in the database, it just leaves here. */
        remove: (docIds) => api.delete(r.documentsRemove(id), { data: docIds }),

        /** Hard: the document is destroyed. */
        destroy: (docIds) => api.delete(r.documents(id), { data: docIds }),
    };
}

async function resolveHandle(ctx, kind) {
    if (kind === 'context') {
        const { resolveContextHandle } = await import('../modules/context/lib/handle.js');
        const handle = resolveContextHandle(ctx);
        return { handle, api: handle.api, id: handle.id };
    }
    const { resolveWorkspaceHandle } = await import('../modules/workspace/lib/handle.js');
    const handle = resolveWorkspaceHandle(ctx);
    return { handle, api: handle.api, id: handle.id };
}

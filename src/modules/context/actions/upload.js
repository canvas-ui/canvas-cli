'use strict';

import { ingestPath } from '../../workspace/lib/fileingest.js';
import { UsageError } from '../../../core/errors.js';

/** Resolve the active context handle (addressed, or the bound one). */
export function resolveContextHandle({ parent, client, session }) {
    if (parent.context) return parent.context;
    const bound = session.boundContext();
    if (bound) return client.resolve(bound);
    throw new UsageError('Context required — bind one with `ctx bind` or address it directly');
}

/** File-ingest adapter bound to a context handle (uploads land in its workspace). */
export function contextAdapter(handle) {
    return {
        label: handle.id,
        // A context has no lifecycle of its own; its backing workspace must be
        // active (the /contexts/:id/blobs route enforces this and errors clearly).
        start: async () => {},
        insertDocuments: (body) => handle.api.contexts.insertDocuments(handle.id, body),
        uploadBlob: (data) => handle.api.contexts.uploadBlob(handle.id, data),
    };
}

// `upload` = UPLOAD bytes into the context's workspace blob store (stored://,
// embeddable) and link the File doc into the context. Contrast `index`.
export default {
    name: 'upload',
    description: 'Upload local file(s)/dir into a context (bytes stored server-side, embeddable)',
    positional: [
        { name: 'source', required: true },
        { name: 'rest', variadic: true },
    ],
    // No path/tree flags — a context inserts at its own focused path (conservative).
    flags: {
        exclude: 'string',
        timeline: 'string',
        'no-defaults': 'boolean',
        'dry-run': 'boolean',
        'batch-size': 'string',
    },
    needsConnection: false,

    async run(ctx) {
        const handle = resolveContextHandle(ctx);
        return ingestPath(ctx, { mode: 'upload', adapter: contextAdapter(handle), useTargets: false });
    },
};

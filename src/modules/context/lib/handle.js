'use strict';

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

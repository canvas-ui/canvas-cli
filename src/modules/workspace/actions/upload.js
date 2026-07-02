'use strict';

import { resolveWorkspaceHandle } from '../lib/handle.js';
import { ingestPath } from '../lib/fileingest.js';

/** Build the file-ingest adapter bound to a workspace handle. */
export function workspaceAdapter(handle) {
    return {
        label: handle.id,
        start: () => handle.api.workspaces.start(handle.id),
        insertDocuments: (body) => handle.api.workspaces.insertDocuments(handle.id, body),
        uploadBlob: (data) => handle.api.workspaces.uploadBlob(handle.id, data),
    };
}

// `upload` = UPLOAD bytes into the workspace blob store (stored://, server-resident,
// embeddable, metadata extracted server-side). Contrast `index` (device pointer).
export default {
    name: 'upload',
    description: 'Upload local file(s)/dir into a workspace (bytes stored server-side, embeddable)',
    positional: [
        { name: 'source', required: true },
        { name: 'rest', variadic: true },
    ],
    flags: {
        path: 'string',
        directory: 'string',
        exclude: 'string',
        timeline: 'string',
        'no-defaults': 'boolean',
        'dry-run': 'boolean',
        'batch-size': 'string',
    },
    flagAliases: { d: 'directory' },
    needsConnection: false,

    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        return ingestPath(ctx, { mode: 'upload', adapter: workspaceAdapter(handle) });
    },
};

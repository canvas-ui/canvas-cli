'use strict';

import { ingestPath } from '../../workspace/lib/fileingest.js';
import { resolveContextHandle, contextAdapter } from './upload.js';

// `index` = INDEX IN PLACE — file://<deviceId> pointer linked into the context;
// bytes stay on the device (NOT uploaded, NOT embeddable). Contrast `upload`/`add`.
export default {
    name: 'index',
    description: 'Index local file(s)/dir in place into a context (device pointer; bytes stay on the device)',
    positional: [
        { name: 'source', required: true },
        { name: 'rest', variadic: true },
    ],
    // No path/tree flags — a context inserts at its own focused path (conservative).
    flags: {
        exclude: 'string',
        'no-defaults': 'boolean',
        'dry-run': 'boolean',
        'batch-size': 'string',
    },
    needsConnection: false,

    async run(ctx) {
        const handle = resolveContextHandle(ctx);
        return ingestPath(ctx, { mode: 'index', adapter: contextAdapter(handle), useTargets: false });
    },
};

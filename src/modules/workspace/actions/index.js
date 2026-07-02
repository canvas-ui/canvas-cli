'use strict';

import { resolveWorkspaceHandle } from '../lib/handle.js';
import { ingestPath } from '../lib/fileingest.js';
import { workspaceAdapter } from './upload.js';

// `index` = INDEX IN PLACE — records a file://<deviceId> pointer; bytes stay on the
// device (NOT uploaded, NOT server-embeddable). Contrast `upload`/`add`.
export default {
    name: 'index',
    description: 'Index local file(s)/dir in place (device pointer; bytes stay on the device)',
    positional: [
        { name: 'source', required: true },
        { name: 'rest', variadic: true },
    ],
    flags: {
        path: 'string',
        directory: 'string',
        exclude: 'string',
        'no-defaults': 'boolean',
        'dry-run': 'boolean',
        'batch-size': 'string',
    },
    flagAliases: { d: 'directory' },
    needsConnection: false,

    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        return ingestPath(ctx, { mode: 'index', adapter: workspaceAdapter(handle) });
    },
};

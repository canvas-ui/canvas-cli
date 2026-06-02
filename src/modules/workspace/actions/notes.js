'use strict';

import { buildListDocumentsParams, normalizeDocumentList } from '../../../core/api-helpers.js';
import { resolveWorkspaceHandle } from '../lib/handle.js';

export default {
    name: 'notes',
    description: 'List notes in workspace',
    positional: [{ name: 'address' }],
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const docs = await handle.api.workspaces.documents(
            handle.id,
            buildListDocumentsParams({ feature: 'data/abstraction/note' }),
        );
        ctx.io.output(normalizeDocumentList(docs));
    },
};

'use strict';

import { buildListDocumentsParams, normalizeDocumentList } from '../../../core/api-helpers.js';
import { resolveWorkspaceHandle } from '../lib/handle.js';

export default {
    name: 'tabs',
    description: 'List tabs in workspace',
    positional: [{ name: 'address' }],
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const docs = await handle.api.workspaces.documents(
            handle.id,
            buildListDocumentsParams({ feature: 'data/abstraction/tab' }),
        );
        ctx.io.output(normalizeDocumentList(docs));
    },
};

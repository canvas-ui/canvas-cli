'use strict';

import { buildListDocumentsParams, normalizeDocumentList } from '../../../core/api-helpers.js';
import { resolveWorkspaceHandle } from '../lib/handle.js';

export default {
    name: 'documents',
    aliases: ['docs'],
    description: 'List or search workspace documents',
    positional: [{ name: 'address' }, { name: 'search' }],
    flags: { feature: 'string', filter: 'string', 'context-path': 'string', tree: 'string' },
    async run(ctx) {
        const { args, flags, io } = ctx;
        const handle = resolveWorkspaceHandle(ctx);
        const params = buildListDocumentsParams({
            q: args.search,
            feature: flags.feature,
            filter: flags.filter,
            context: flags['context-path'],
            treeNameOrTreeId: flags.tree,
        });
        const docs = await handle.api.workspaces.documents(handle.id, params);
        io.output(normalizeDocumentList(docs));
    },
};

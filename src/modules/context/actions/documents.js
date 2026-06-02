'use strict';

import { UsageError } from '../../../core/errors.js';
import { buildListDocumentsParams, normalizeDocumentList } from '../../../core/api-helpers.js';

export default {
    name: 'documents',
    aliases: ['docs'],
    description: 'List/search context documents',
    positional: [{ name: 'search' }],
    flags: { feature: 'string', filter: 'string' },
    async run({ parent, args, flags, client, session, io }) {
        const handle = parent.context || (session.boundContext() && client.resolve(session.boundContext()));
        if (!handle) throw new UsageError('Context required');
        const params = buildListDocumentsParams({
            q: args.search,
            feature: flags.feature,
            filter: flags.filter,
        });
        const docs = await handle.api.contexts.documents(handle.id, params);
        io.output(normalizeDocumentList(docs));
    },
};

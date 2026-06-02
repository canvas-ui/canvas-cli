'use strict';

import { UsageError } from '../../../core/errors.js';
import { buildListDocumentsParams, normalizeDocumentList } from '../../../core/api-helpers.js';

export default {
    name: 'dotfiles',
    aliases: ['dot'],
    description: 'List context dotfiles',
    async run({ parent, client, session, io }) {
        const handle = parent.context || (session.boundContext() && client.resolve(session.boundContext()));
        if (!handle) throw new UsageError('Context required');
        const docs = await handle.api.contexts.documents(
            handle.id,
            buildListDocumentsParams({ feature: 'data/abstraction/dotfile' }),
        );
        io.output(normalizeDocumentList(docs));
    },
};

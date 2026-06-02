'use strict';

import { UsageError } from '../../../core/errors.js';
import { buildListDocumentsParams, normalizeDocumentList } from '../../../core/api-helpers.js';

export default {
    name: 'tabs',
    aliases: ['tab'],
    description: 'List or add tabs in context',
    positional: [{ name: 'op' }, { name: 'value' }],
    flags: { title: 'string' },
    async run({ parent, args, flags, client, session, io }) {
        const handle = parent.context || (session.boundContext() && client.resolve(session.boundContext()));
        if (!handle) throw new UsageError('Context required');
        const op = args.op || 'list';
        if (op === 'list' || !['add', 'get', 'delete', 'remove'].includes(op)) {
            const docs = await handle.api.contexts.documents(
                handle.id,
                buildListDocumentsParams({ feature: 'data/abstraction/tab' }),
            );
            io.output(normalizeDocumentList(docs));
            return;
        }
        if (op === 'add') {
            if (!args.value) throw new UsageError('URL required');
            const doc = {
                schema: 'data/abstraction/tab',
                data: {
                    url: args.value,
                    title: flags.title || args.value,
                    timestamp: new Date().toISOString(),
                },
            };
            await handle.api.post(`/contexts/${handle.id}/documents`, {
                documents: [doc],
                features: ['data/abstraction/tab', 'client/app/canvas-cli'],
            });
            io.success('Tab added');
            return;
        }
        // get/delete/remove single doc
        if (!args.value) throw new UsageError('Document id required');
        if (op === 'get') {
            const d = await handle.api.get(`/contexts/${handle.id}/documents/${args.value}`);
            io.output(d?.document || d);
            return;
        }
        const endpoint = op === 'delete'
            ? `/contexts/${handle.id}/documents`
            : `/contexts/${handle.id}/documents/remove`;
        await handle.api.delete(endpoint, { data: [args.value] });
        io.success(`Tab ${op === 'delete' ? 'deleted' : 'removed'}`);
    },
};

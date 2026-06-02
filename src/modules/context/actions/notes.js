'use strict';

import { UsageError } from '../../../core/errors.js';
import { buildListDocumentsParams, normalizeDocumentList } from '../../../core/api-helpers.js';

export default {
    name: 'notes',
    aliases: ['note'],
    description: 'List or add notes in context',
    positional: [{ name: 'op' }, { name: 'value' }],
    flags: { title: 'string' },
    async run({ parent, args, flags, client, session, io }) {
        const handle = parent.context || (session.boundContext() && client.resolve(session.boundContext()));
        if (!handle) throw new UsageError('Context required');
        const op = args.op || 'list';
        if (op === 'list' || !['add', 'get', 'delete', 'remove'].includes(op)) {
            const docs = await handle.api.contexts.documents(
                handle.id,
                buildListDocumentsParams({ feature: 'data/abstraction/note' }),
            );
            io.output(normalizeDocumentList(docs));
            return;
        }
        if (op === 'add') {
            if (!args.value) throw new UsageError('Note text required');
            const doc = {
                schema: 'data/abstraction/note',
                data: {
                    content: args.value,
                    title: flags.title || `Note - ${new Date().toLocaleString()}`,
                    timestamp: new Date().toISOString(),
                },
            };
            await handle.api.post(`/contexts/${handle.id}/documents`, {
                documents: [doc],
                features: ['data/abstraction/note', 'client/app/canvas-cli'],
            });
            io.success('Note added');
            return;
        }
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
        io.success(`Note ${op === 'delete' ? 'deleted' : 'removed'}`);
    },
};

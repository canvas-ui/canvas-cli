'use strict';

export default {
    name: 'list',
    aliases: ['ls'],
    description: 'List API tokens',
    needsConnection: true,
    async run({ client, io }) {
        const tokens = await client.client().auth.tokens.list();
        io.output(tokens, {
            columns: [
                'id', 'name',
                { key: 'description', label: 'description', width: 32, dim: true },
                { key: 'createdAt', label: 'created', format: 'date' },
                { key: 'lastUsedAt', label: 'last used', format: 'date' },
            ],
        });
    },
};

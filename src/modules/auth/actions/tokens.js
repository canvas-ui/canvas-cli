'use strict';

export default {
    name: 'tokens',
    description: 'List API tokens',
    needsConnection: true,
    async run({ client, io }) {
        const tokens = await client.client().auth.tokens.list();
        io.output(tokens, { columns: ['id', 'name', 'description', 'createdAt', 'lastUsedAt'] });
    },
};

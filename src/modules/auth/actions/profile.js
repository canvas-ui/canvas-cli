'use strict';

export default {
    name: 'profile',
    description: 'Show user profile',
    needsConnection: true,
    async run({ client, io }) {
        const me = await client.client().auth.me();
        io.output(me);
    },
};

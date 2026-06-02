'use strict';

export default {
    name: 'status',
    description: 'Show auth status of bound remote',
    async run({ client, session, io }) {
        const id = session.boundRemote();
        if (!id) { io.warn('No remote bound'); return; }
        const r = client.getRemote(id);
        if (!r) { io.error(`Remote '${id}' not found`); return; }
        const token = r.auth?.token;
        io.output({
            remote: id,
            authMethod: r.auth?.method || 'none',
            tokenType: r.auth?.tokenType || 'none',
            hasToken: !!token,
            tokenPreview: token ? `${token.slice(0, 10)}...` : null,
        });
        if (!token) { io.warn('Not authenticated'); return; }
        try {
            await client.client(id).ping();
            io.success('Reachable');
        } catch (e) {
            io.error(`Unreachable: ${e.message}`);
        }
    },
};

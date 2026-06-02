'use strict';

export default {
    name: 'current',
    description: 'Show current bound context',
    needsConnection: false,
    async run({ client, session, io }) {
        const ctx = session.boundContext();
        if (!ctx) {
            io.warn('No context bound');
            io.info('Use: canvas context bind <address>');
            return;
        }
        io.output({
            context: ctx,
            remote: session.boundRemote(),
            url: session.get('boundContextUrl'),
            boundAt: session.get('boundAt'),
        });
        try {
            const { api, id } = client.resolve(ctx);
            const c = await api.contexts.get(id);
            io.output(c?.context || c);
        } catch (e) {
            io.warn(`Context not reachable: ${e.message}`);
        }
    },
};

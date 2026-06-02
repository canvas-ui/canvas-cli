'use strict';

export default {
    name: 'current',
    description: 'Show current bound remote',
    async run({ client, session, io }) {
        const id = session.boundRemote();
        if (!id) {
            io.warn('No remote bound');
            io.info('Bind: canvas remote bind <user@remote>');
            return;
        }
        const r = client.getRemote(id);
        if (!r) { io.error(`Remote '${id}' not found`); return; }
        io.output({
            id,
            url: r.url,
            version: r.version || 'Unknown',
            lastSynced: r.lastSynced || null,
        });
    },
};

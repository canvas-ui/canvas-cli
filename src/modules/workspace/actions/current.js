'use strict';

export default {
    name: 'current',
    description: 'Show workspace of current context',
    needsConnection: false,
    async run({ _client, session, io }) {
        const ctx = session.boundContext();
        if (!ctx) { io.warn('No context bound'); return; }
        const url = session.get('boundContextUrl');
        const ws = url?.includes('://') ? url.split('://')[0] : 'universe';
        io.output({ context: ctx, remote: session.boundRemote(), workspace: ws });
    },
};

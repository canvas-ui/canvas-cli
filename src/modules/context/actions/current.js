'use strict';

// Columns worth seeing at a glance. The full context document has ~30 fields
// (bitmaps, ACLs, tree ids, toolbox metadata) — dumping all of them as a table
// produced an unreadable wall of columns. `canvas context show` still prints
// the whole document, and -f json here carries it under `document`.
const COLUMNS = ['context', 'remote', 'url', 'workspace', 'path', 'boundAt'];

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

        const summary = {
            context: ctx,
            remote: session.boundRemote(),
            url: session.get('boundContextUrl'),
            boundAt: session.get('boundAt'),
        };

        let doc = null;
        try {
            const { api, id } = client.resolve(ctx);
            const c = await api.contexts.get(id);
            doc = c?.context || c || null;
        } catch (e) {
            io.warn(`Context not reachable: ${e.message}`);
        }

        if (io.format === 'json' || io.format === 'raw') {
            io.output({ ...summary, document: doc });
            return;
        }

        io.output(
            {
                ...summary,
                url: doc?.url || summary.url,
                workspace: doc?.workspaceName || workspaceFromUrl(doc?.url || summary.url),
                path: doc?.path,
            },
            { columns: COLUMNS },
        );
    },
};

function workspaceFromUrl(url) {
    return url?.includes('://') ? url.split('://')[0] : null;
}

'use strict';

export default {
    name: 'sync',
    description: 'Sync remote info (ping + cache version)',
    positional: [{ name: 'id' }],
    async run({ args, client, io }) {
        const ids = args.id ? [args.id] : Object.keys(client.remotes());
        if (ids.length === 0) { io.warn('No remotes configured'); return; }
        let ok = 0, fail = 0;
        for (const id of ids) {
            try {
                client.clearCache(id);
                const info = await client.ping(id);
                client.updateRemote(id, {
                    version: info?.version || null,
                    lastSynced: new Date().toISOString(),
                });
                io.success(`'${id}' synced${info?.version ? ` (v${info.version})` : ''}`);
                ok++;
            } catch (e) {
                io.error(`'${id}' failed: ${e.message}`);
                fail++;
            }
        }
        if (ids.length > 1) io.info(`Synced: ${ok}, Failed: ${fail}`);
    },
};

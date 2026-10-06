import { normalizeTls, loadTls } from '@augmentd-labs/canvas-api-client/tls';
import { UsageError } from '../../../core/errors.js';
function target({ parent, args, session, client }) {
    const id = parent?.remote?.id || args.id || session.boundRemote();
    if (!id || !client.getRemote(id)) throw new UsageError('A configured remote id is required');
    return id;
}
export default {
    name: 'tls', description: 'Configure client certificate authentication', needsConnection: false,
    defaultAction: 'show', submodules: [], actions: [
        { name: 'set', description: 'Set PEM client certificate and key', positional: [{ name: 'id' }],
            flags: { 'tls-cert': 'string', 'tls-key': 'string' },
            async run(ctx) {
                const id = target(ctx);
                const tls = normalizeTls({ certFile: ctx.flags['tls-cert'], keyFile: ctx.flags['tls-key'] });
                loadTls(ctx.client.getRemote(id).url, tls);
                ctx.client.updateRemote(id, { tls });
                ctx.io.success(`Client certificate configured for '${id}'. Restart running mirrors/mounts.`);
            } },
        { name: 'show', description: 'Show client certificate paths', positional: [{ name: 'id' }],
            async run(ctx) { const id = target(ctx); ctx.io.print(JSON.stringify(ctx.client.getRemote(id).tls || null, null, 2)); } },
        { name: 'clear', description: 'Remove client certificate configuration', positional: [{ name: 'id' }],
            async run(ctx) { const id = target(ctx); const remote = { ...ctx.client.getRemote(id) }; delete remote.tls;
                ctx.client.saveRemote(id, remote); ctx.io.success(`Client certificate configuration cleared for '${id}'. Restart running mirrors/mounts.`); } },
    ],
};

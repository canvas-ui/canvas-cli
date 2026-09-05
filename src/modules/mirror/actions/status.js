'use strict';

import { findMirror, listMirrors } from '../lib/config.js';
import { statusAll } from '../lib/fuse.js';
import { unwrap } from '../lib/hub.js';
import { edgeStatus } from '../lib/edge.js';

export default {
    name: 'status',
    description: 'Sync state of each mirror (local daemon + hub view)',
    positional: [{ name: 'workspace', required: false }],
    async run({ args, client, io }) {
        const mirrors = args.workspace ? [findMirror(args.workspace)].filter(Boolean) : listMirrors();
        if (mirrors.length === 0) { io.info('No mirrors. Run `canvas mirror init`.'); return; }
        const running = await statusAll().catch(() => []);
        const byMount = new Map(running.map((m) => [m.mountpoint, m]));
        const edge = mirrors.some((m) => m.client === 'daemon') ? await edgeStatus().catch(() => null) : null;
        const edgeById = new Map((edge?.mirrors || []).map((m) => [m.id, m]));
        const rows = [];
        for (const m of mirrors) {
            const isDaemon = m.client === 'daemon';
            const st = isDaemon ? (edgeById.get(m.id) ? { status: 'ok' } : null) : byMount.get(m.mountpoint);
            const mi = isDaemon ? (edgeById.get(m.id) || {}) : (st?.mirror || {});
            let hubLag = '-';
            try {
                const rc = client.client(m.remote);
                const remoteMirrors = unwrap(await rc.workspaces.sync.mirrors(m.workspaceName));
                const mine = Array.isArray(remoteMirrors) ? remoteMirrors.find((r) => r.mirror?.path === m.mountpoint) || remoteMirrors[0] : null;
                if (mine && mine.lag != null) hubLag = String(mine.lag);
            } catch { /* offline or old hub */ }
            rows.push({
                workspace: m.workspaceName,
                client: m.client || 'fuse',
                mount: st ? (st.status || 'ok') : 'down',
                state: mi.state || '-',
                cursor: mi.cursor != null ? `${mi.cursor}/${mi.head ?? '?'}` : '-',
                pending: mi.pending ?? '-',
                failed: mi.failed ?? '-',
                conflicts: mi.conflicts ?? '-',
                lag: hubLag,
                cache: mi.cacheUsed != null ? `${Math.round(mi.cacheUsed / 1048576)}/${Math.round((mi.cacheBudget || 0) / 1048576)} MB` : '-',
                lastSync: mi.lastSync || '-',
                error: mi.lastError || '',
            });
        }
        io.output(rows, { columns: ['workspace', 'client', 'mount', 'state', 'cursor', 'pending', 'failed', 'conflicts', 'lag', 'cache', 'lastSync', 'error'] });
    },
};

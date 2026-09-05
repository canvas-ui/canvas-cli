'use strict';

import { UsageError } from '../../../core/errors.js';
import { findMirror, listMirrors } from '../lib/config.js';
import { unwrap } from '../lib/hub.js';

export default {
    name: 'conflicts',
    description: 'Open sync conflicts on the hub; resolve with --resolve <docId> --keep hub|incoming|both',
    positional: [{ name: 'workspace', required: false }],
    flags: { resolve: 'string', keep: 'string' },
    async run({ args, flags, client, io }) {
        const targets = args.workspace ? [findMirror(args.workspace)].filter(Boolean) : listMirrors();
        if (targets.length === 0) throw new UsageError('No mirrors configured');
        if (flags.resolve) {
            if (targets.length !== 1) throw new UsageError('Name the workspace when resolving');
            if (!['hub', 'incoming', 'both'].includes(flags.keep)) throw new UsageError('--keep must be hub | incoming | both');
            const m = targets[0];
            const res = await client.client(m.remote).workspaces.sync.resolveConflict(m.workspaceName, Number(flags.resolve), flags.keep);
            const out = unwrap(res);
            io.success(`Resolved ${flags.resolve}: keep ${flags.keep}${out?.resultKey ? ` → ${out.resultKey}` : ''}`);
            return;
        }
        const rows = [];
        for (const m of targets) {
            let list = [];
            try { list = unwrap(await client.client(m.remote).workspaces.sync.conflicts(m.workspaceName)) || []; }
            catch (e) { io.warn(`${m.workspaceName}: ${e.message}`); continue; }
            for (const c of list) {
                rows.push({
                    workspace: m.workspaceName,
                    docId: c.docId,
                    key: c.key,
                    device: c.deviceName || c.device || '',
                    when: c.ts || '',
                    hub: c.hub ? `${String(c.hub.sha256 || '').slice(0, 10)} ${c.hub.size ?? ''}B` : '(gone)',
                    incoming: `${String(c.incoming?.sha256 || '').slice(0, 10)} ${c.incoming?.size ?? ''}B`,
                    resolvable: c.resolvable ? 'yes' : 'copy on disk',
                });
            }
        }
        if (rows.length === 0) { io.success('No conflicts'); return; }
        io.output(rows, { columns: ['workspace', 'docId', 'key', 'device', 'when', 'hub', 'incoming', 'resolvable'] });
        io.info('Resolve: canvas mirror conflicts <workspace> --resolve <docId> --keep hub|incoming|both');
    },
};

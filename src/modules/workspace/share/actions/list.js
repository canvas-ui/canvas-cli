'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';
import { edgeStatus } from '../../../mirror/lib/edge.js';
import { readShares, shareId } from '../lib.js';

// The workspace's shares, with what this machine knows about the ones it serves.
export default {
    name: 'list',
    description: 'List the workspace\'s shares and their state',
    aliases: ['ls', 'status'],
    flags: { workspace: 'string' },
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const rows = await handle.api.workspaces.backends.list(handle.id, 'share');
        const backends = Array.isArray(rows) ? rows : [];
        const local = new Map(readShares().map((s) => [s.id, s]));
        const units = await edgeStatus().then((s) => new Map((s?.mirrors || []).filter((u) => u.unit === 'share').map((u) => [u.id, u]))).catch(() => null);
        if (!backends.length) { ctx.io.warn('No shares'); return; }
        ctx.io.output(backends.map((b) => {
            const id = shareId(handle.remoteId, handle.id, b.address);
            const here = local.get(id);
            const unit = units?.get(id);
            return {
                name: b.address,
                label: b.config?.label || '',
                // offline: the machine holding the folder is not connected; the catalog stays.
                status: b.status,
                files: b.config?.source?.files ?? '',
                device: b.config?.source?.device?.name || '',
                tree: b.treePath || '',
                folder: here?.path || '',
                // What this machine's daemon says: serving, scanning, unavailable (folder gone), offline (hub unreachable).
                here: !here ? '' : here.paused ? 'paused' : !units ? 'daemon not running' : !unit ? 'not loaded' : unit.state === 'serving' || unit.state === 'scanning' || !unit.lastError ? unit.state : `${unit.state}: ${unit.lastError}`,
            };
        }), { columns: ['name', 'label', 'status', 'files', 'device', 'tree', 'folder', 'here'] });
    },
};

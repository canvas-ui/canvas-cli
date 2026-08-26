'use strict';

import { entryPath } from '../../lib/docs.js';
import { resolveHandle } from '../../lib/handle.js';
import device from '../../lib/device.js';

const COLUMNS = [
    { label: '', get: (r) => (r.here ? '*' : ''), width: 1, emptyText: '' },
    { key: 'repoPath', label: 'entry' },
    { key: 'deviceId', label: 'device' },
    { key: 'localPath', label: 'local path' },
];

export default {
    name: 'list',
    aliases: ['ls'],
    description: 'List every entry → device → local path mapping',
    needsConnection: false,
    positional: [{ name: 'address' }],
    flags: { workspace: 'string' },
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const info = device.info();
        const docs = await handle.api.workspaces.dotfiles.list(handle.id);
        const rows = (Array.isArray(docs) ? docs : docs?.documents || []).flatMap((doc) =>
            Object.entries(doc.data?.links || {}).map(([deviceId, localPath]) => ({
                here: deviceId === info.deviceId,
                repoPath: entryPath(doc),
                deviceId,
                localPath,
            })),
        );
        if (rows.length === 0) { ctx.io.warn('No links'); return; }
        ctx.io.output(rows, { columns: COLUMNS });
    },
};

'use strict';

import device from '../lib/device.js';

export default {
    name: 'devices',
    description: 'Show this device + (if workspace given) per-device link map',
    needsConnection: false,
    positional: [{ name: 'address' }],
    flags: { workspace: 'string' },
    async run(ctx) {
        const { args, flags, parent, client, rest, io } = ctx;
        const info = device.info();
        io.print(`This device: ${info.deviceId}`);
        io.output(info);
        const addr = parent.workspace
            || (args?.address && client.resolve(args.address))
            || (flags.workspace && client.resolve(flags.workspace))
            || (rest || []).map((t) => (typeof t === 'string' && (t.includes('@') || t.includes(':')))
                ? client.resolve(t) : null).find(Boolean);
        if (!addr) return;
        const handle = addr;
        const docs = await handle.api.workspaces.dotfiles.list(handle.id);
        const rows = (Array.isArray(docs) ? docs : docs?.documents || []).flatMap((doc) =>
            Object.entries(doc.data?.links || {}).map(([deviceId, localPath]) => ({
                here: deviceId === info.deviceId ? '*' : '',
                repoPath: doc.data.repoPath,
                deviceId,
                localPath,
            })),
        );
        if (rows.length === 0) { io.warn('No links'); return; }
        io.output(rows, { columns: ['here', 'repoPath', 'deviceId', 'localPath'] });
    },
};

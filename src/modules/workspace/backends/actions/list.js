'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';

export default {
    name: 'list',
    description: 'List workspace data backends',
    aliases: ['ls'],
    flags: { workspace: 'string', driver: 'string' },
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const driver = ctx.flags.driver === 'fs' ? 'file' : (ctx.flags.driver || null);
        const rows = await handle.api.workspaces.backends.list(handle.id, driver);
        const backends = Array.isArray(rows) ? rows : [];
        if (!backends.length) {
            ctx.io.warn('No backends');
            return;
        }
        const flat = backends.map((b) => ({
            driver: b.driver,
            address: b.address,
            label: b.config?.label || '',
            status: b.status,
            enabled: b.enabled !== false,
            watch: b.config?.watch === true,
            readOnly: b.config?.readOnly === true,
            device: b.config?.device?.name || '',
            root: b.config?.root || '',
        }));
        ctx.io.output(flat, { columns: ['driver', 'address', 'label', 'status', 'enabled', 'watch', 'readOnly', 'device', 'root'] });
    },
};

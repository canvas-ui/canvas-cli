'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';

// Value-style flags (--watch true / --watch false) instead of booleans:
// a PATCH must distinguish "not passed" from "explicitly off", and minimist
// defaults declared booleans to false.
function parseBool(name, value) {
    const v = String(value).toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'off'].includes(v)) return false;
    throw new UsageError(`--${name} expects true or false`);
}

export default {
    name: 'update',
    description: 'Update a backend (--watch true|false, --read-only true|false, --enabled true|false, --exclude a,b)',
    aliases: ['set'],
    positional: [{ name: 'backend', required: true }],
    flags: { workspace: 'string', driver: 'string', watch: 'string', 'read-only': 'string', enabled: 'string', exclude: 'string', label: 'string' },
    async run(ctx) {
        const { args, flags, io } = ctx;
        const handle = resolveWorkspaceHandle(ctx);
        if (!args.backend) throw new UsageError('Backend address required');
        const driver = flags.driver === 'fs' ? 'file' : (flags.driver || 'file');

        const patch = {};
        if (flags.watch !== undefined) patch.watch = parseBool('watch', flags.watch);
        if (flags['read-only'] !== undefined) patch.readOnly = parseBool('read-only', flags['read-only']);
        if (flags.enabled !== undefined) patch.enabled = parseBool('enabled', flags.enabled);
        if (flags.exclude !== undefined) patch.exclude = String(flags.exclude).split(',').map((p) => p.trim()).filter(Boolean);
        if (flags.label !== undefined) patch.label = flags.label;
        if (!Object.keys(patch).length) throw new UsageError('Nothing to update — pass --watch/--read-only/--enabled/--exclude/--label');

        const backend = await handle.api.workspaces.backends.update(handle.id, driver, args.backend, patch);
        io.success(`Updated ${driver}/${args.backend}: ${Object.entries(patch).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`).join(' ')}`);
        ctx.io.output([{
            driver: backend.driver,
            address: backend.address,
            enabled: backend.enabled !== false,
            watch: backend.config?.watch === true,
            readOnly: backend.config?.readOnly === true,
        }], { columns: ['driver', 'address', 'enabled', 'watch', 'readOnly'] });
    },
};

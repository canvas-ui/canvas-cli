'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';

export default {
    name: 'usage',
    description: 'Measure how much space a backend takes: a local folder on disk, or an S3 bucket prefix (lists every object)',
    aliases: ['du', 'size'],
    positional: [{ name: 'backend', required: true }],
    flags: { workspace: 'string', driver: 'string' },
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const backends = handle.api.workspaces.backends;
        if (!ctx.args.backend) throw new UsageError('Backend address required (see: backends list)');
        let driver = ctx.flags.driver === 'fs' ? 'file' : ctx.flags.driver;
        if (!driver) {
            const matches = (await backends.list(handle.id) || []).filter((b) => b.address === ctx.args.backend);
            if (matches.length > 1) throw new UsageError(`Several backends are named "${ctx.args.backend}"; pass --driver ${matches.map((b) => b.driver).join('|')}`);
            if (!matches.length) throw new UsageError(`No backend "${ctx.args.backend}" (see: backends list)`);
            driver = matches[0].driver;
        }
        // A long S3 listing answers with running totals until it is complete.
        let usage;
        do { usage = await backends.usage(handle.id, driver, ctx.args.backend); } while (usage?.measuring);
        ctx.io.detail({ driver, ...usage }, { columns: [
            'driver', 'backend',
            { key: 'bytes', label: 'size', format: 'bytes' },
            'bytes', 'objects',
            { key: 'computedAt', label: 'measured', format: 'date' },
        ] });
    },
};

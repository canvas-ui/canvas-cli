'use strict';

import { resolveHandle } from '../lib/handle.js';

export default {
    name: 'runs',
    description: 'Show recent hook/rule runs (newest first)',
    flags: {
        failed: 'boolean', // only failed runs
        handler: 'string', // filter by hook file / rule id (substring)
        event: 'string', // filter by event name
        limit: 'string', // max records (default 50)
    },
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const params = {};
        if (ctx.flags.failed) { params.failed = true; }
        if (ctx.flags.handler) { params.handler = ctx.flags.handler; }
        if (ctx.flags.event) { params.event = ctx.flags.event; }
        if (ctx.flags.limit) { params.limit = Number(ctx.flags.limit) || 50; }

        const rows = await handle.api.workspaces.hooks.runs(handle.id, params);
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) {
            ctx.io.warn('No hook runs recorded');
            return;
        }
        ctx.io.output(list.map((r) => ({
            ts: r.ts,
            handler: `${r.handlerType}:${r.handler}`,
            event: r.event,
            docs: (r.docIds || []).join(','),
            ms: r.durationMs,
            status: r.status + (r.skipReason ? ` (${r.skipReason})` : '') + (r.error ? `: ${r.error}` : ''),
            runId: r.runId,
        })), { columns: ['ts', 'handler', 'event', 'docs', 'ms', 'status', 'runId'] });
    },
};

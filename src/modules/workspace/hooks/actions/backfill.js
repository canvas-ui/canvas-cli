'use strict';

import { UsageError } from '../../../../core/errors.js';
import { resolveHandle } from '../lib/handle.js';

export default {
    name: 'backfill',
    description: 'Run one rule/hook against existing documents (use --dry-run first)',
    flags: {
        rule: 'string', // rule id (exactly one of --rule/--hook)
        hook: 'string', // hook file path relative to git/hooks
        event: 'string', // event to simulate (default document.inserted)
        schema: 'string', // override document discovery filter (e.g. email)
        limit: 'string', // max documents (default 100, cap 500)
        'dry-run': 'boolean', // evaluate matchers only, execute nothing
    },
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const { rule, hook } = ctx.flags;
        if ((rule ? 1 : 0) + (hook ? 1 : 0) !== 1) {
            throw new UsageError('Pass exactly one of --rule <id> or --hook <path>');
        }

        const body = rule ? { ruleId: rule } : { hookFile: hook };
        if (ctx.flags.event) { body.event = ctx.flags.event; }
        if (ctx.flags.schema) { body.schema = ctx.flags.schema; }
        if (ctx.flags.limit) { body.limit = Number(ctx.flags.limit) || 100; }
        if (ctx.flags['dry-run']) { body.dryRun = true; }

        const result = await handle.api.workspaces.hooks.backfill(handle.id, body);
        ctx.io.info(`${result.dryRun ? 'Dry-run' : 'Backfill'} · processed ${result.processed}, matched ${result.matched}, failed ${result.failed}`);
        if (!result.results?.length) {
            ctx.io.warn('No documents discovered — check --schema / workspace activity');
            return;
        }
        ctx.io.output(result.results.map((r) => ({
            doc: r.docId,
            schema: r.schema,
            outcome: result.dryRun
                ? (r.matched === null ? 'hook (code decides)' : r.matched ? 'would fire' : 'no match')
                : r.status,
        })), { columns: ['doc', 'schema', 'outcome'] });
    },
};

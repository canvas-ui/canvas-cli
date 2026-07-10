'use strict';

import { UsageError } from '../../../../core/errors.js';
import { resolveHandle } from '../lib/handle.js';

export default {
    name: 'replay',
    description: 'Re-deliver a logged run\'s envelope to its handler',
    positional: [{ name: 'runId', required: true }],
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const runId = ctx.args.runId;
        if (!runId) {
            throw new UsageError('Usage: canvas ws <name> hooks replay <runId>  (run ids: hooks runs)');
        }
        const result = await handle.api.workspaces.hooks.replay(handle.id, runId);
        ctx.io.info(`Replayed ${result.replayedRunId} → ${result.event} → ${JSON.stringify(result.target)} · ${result.status}`);
        if (result.actions?.length) {
            ctx.io.output(result.actions, { columns: ['action', 'status', 'error'] });
        }
    },
};

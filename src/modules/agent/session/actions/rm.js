'use strict';

import { UsageError } from '../../../../core/errors.js';
import { resolveAgentHandle, agentPath } from '../../lib/handle.js';

export default {
    name: 'rm',
    aliases: ['remove', 'delete'],
    description: 'Delete a session and its transcript',
    positional: [{ name: 'agent' }, { name: 'sessionId' }],
    flags: { force: 'boolean' },
    async run(ctx) {
        const agent = await resolveAgentHandle(ctx);
        const sessionId = ctx.parent.agent ? (ctx.args.agent ?? ctx.args.sessionId) : ctx.args.sessionId;
        if (!sessionId) throw new UsageError('Session id required');
        if (!ctx.flags.force) {
            throw new UsageError(`Deleting a session discards its transcript. Re-run with --force.`);
        }
        await agent.api.delete(agentPath(agent, `/sessions/${encodeURIComponent(sessionId)}`));
        ctx.io.success(`Deleted session ${sessionId}`);
    },
};

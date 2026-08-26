'use strict';

import { UsageError } from '../../../../core/errors.js';
import { resolveAgentHandle, agentPath } from '../../lib/handle.js';

export default {
    name: 'rename',
    description: 'Rename a session',
    positional: [{ name: 'agent' }, { name: 'sessionId' }, { name: 'name' }],
    async run(ctx) {
        const agent = await resolveAgentHandle(ctx);
        const addressed = Boolean(ctx.parent.agent);
        const sessionId = addressed ? ctx.args.agent : ctx.args.sessionId;
        const name = addressed ? ctx.args.sessionId : ctx.args.name;
        if (!sessionId || !name) throw new UsageError('Usage: canvas agent <agent> session rename <sessionId> <name>');
        await agent.api.patch(agentPath(agent, `/sessions/${encodeURIComponent(sessionId)}`), { name });
        ctx.io.success(`Renamed ${sessionId} to '${name}'`);
    },
};

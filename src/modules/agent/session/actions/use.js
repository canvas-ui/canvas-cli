'use strict';

import { resolveAgentHandle, agentPath } from '../../lib/handle.js';

export default {
    name: 'use',
    aliases: ['switch', 'bind'],
    description: 'Continue an earlier session',
    positional: [{ name: 'agent' }, { name: 'sessionId' }],
    flags: { mode: 'string' },
    async run(ctx) {
        const agent = await resolveAgentHandle(ctx);
        // `agent lucy session use <id>` puts the id in `sessionId`; the
        // trailing form `agent session use <id>` leaves it in `agent`.
        const sessionId = ctx.parent.agent ? (ctx.args.agent ?? ctx.args.sessionId) : ctx.args.sessionId;
        await agent.api.put(agentPath(agent, '/session'), { sessionId, mode: ctx.flags.mode });
        ctx.io.success(`'${agent.name}' now talking in ${sessionId || ctx.flags.mode || 'the selected session'}`);
    },
};

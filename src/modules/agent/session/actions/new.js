'use strict';

import { resolveAgentHandle, agentPath } from '../../lib/handle.js';

export default {
    name: 'new',
    aliases: ['create'],
    description: 'Start a new session (--mode incognito|experimental)',
    positional: [{ name: 'agent' }, { name: 'name' }],
    flags: { mode: 'string' },
    async run(ctx) {
        const agent = await resolveAgentHandle(ctx);
        const res = await agent.api.post(agentPath(agent, '/sessions'), {
            name: ctx.args.name,
            mode: ctx.flags.mode,
        });
        const payload = res?.payload || res;
        ctx.io.success(`New session for '${agent.name}'${payload?.mode ? ` (${payload.mode})` : ''}`);
        if (payload?.path) ctx.io.info(payload.path);
    },
};

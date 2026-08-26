'use strict';

import { resolveAgentHandle, agentPath } from '../../lib/handle.js';

const COLUMNS = [
    { key: 'name', label: 'skill' },
    { key: 'description', label: 'description', width: 48, dim: true },
    { key: 'source', label: 'source', width: 30, dim: true },
];

export default {
    name: 'list',
    aliases: ['ls'],
    description: 'List installed skills',
    positional: [{ name: 'agent' }],
    async run(ctx) {
        const agent = await resolveAgentHandle(ctx);
        const res = await agent.api.get(agentPath(agent, '/skills'));
        const payload = res?.payload || res;
        const skills = Array.isArray(payload) ? payload : payload?.skills || [];
        ctx.io.output(skills, { columns: COLUMNS });
    },
};

'use strict';

import { resolveAgentHandle, agentPath } from '../../lib/handle.js';

const COLUMNS = [
    { key: 'name', label: 'tool' },
    { key: 'description', label: 'description', width: 60, dim: true },
];

export default {
    name: 'list',
    aliases: ['ls'],
    description: 'List the tools this agent can call',
    positional: [{ name: 'agent' }],
    async run(ctx) {
        const agent = await resolveAgentHandle(ctx);
        const res = await agent.api.get(agentPath(agent, '/tools'));
        const payload = res?.payload || res;
        const tools = Array.isArray(payload) ? payload : payload?.tools || [];
        ctx.io.output(tools.map(normalize), { columns: COLUMNS });
    },
};

// The runtime returns either bare names or tool descriptors depending on how
// the agent was configured; both list the same way.
function normalize(tool) {
    return typeof tool === 'string' ? { name: tool } : tool;
}

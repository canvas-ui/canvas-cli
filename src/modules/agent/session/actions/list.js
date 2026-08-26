'use strict';

import { resolveAgentHandle, agentPath } from '../../lib/handle.js';

const COLUMNS = [
    { label: '', get: (s) => (s.isCurrent ? '*' : ''), width: 1, emptyText: '' },
    { key: 'slug', label: 'session' },
    { label: 'name', get: (s) => s.name || s.firstMessage, width: 40 },
    { key: 'messageCount', label: 'msgs' },
    { key: 'updatedAt', label: 'updated', format: 'date' },
];

export default {
    name: 'list',
    aliases: ['ls'],
    description: 'List agent sessions',
    positional: [{ name: 'agent' }],
    async run(ctx) {
        const agent = await resolveAgentHandle(ctx);
        const res = await agent.api.get(agentPath(agent, '/sessions'));
        const payload = res?.payload || res;
        ctx.io.output(payload?.sessions || [], { columns: COLUMNS });
    },
};

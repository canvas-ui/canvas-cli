'use strict';

import { resolveAgentHandle, agentPath } from '../../lib/handle.js';

const COLUMNS = [
    { key: 'sessionId', label: 'session' },
    { key: 'mode', label: 'mode' },
    { label: 'model', get: (s) => modelName(s.model) },
    { key: 'thinkingLevel', label: 'thinking' },
    { label: 'messages', get: (s) => (Array.isArray(s.messages) ? s.messages.length : s.messages) },
    { key: 'path', label: 'path', dim: true },
];

// The runtime reports a model as {provider, modelId}; printed raw it is a
// JSON blob in the middle of an otherwise readable record.
function modelName(model) {
    if (!model) return null;
    if (typeof model === 'string') return model;
    return [model.provider, model.modelId || model.model].filter(Boolean).join('/');
}

export default {
    name: 'current',
    description: 'Show the session this agent is talking in',
    positional: [{ name: 'agent' }],
    async run(ctx) {
        const agent = await resolveAgentHandle(ctx);
        const res = await agent.api.get(agentPath(agent, '/session'));
        ctx.io.detail(res?.payload || res, { columns: COLUMNS });
    },
};

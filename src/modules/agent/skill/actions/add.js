'use strict';

import { resolveAgentHandle, agentPath } from '../../lib/handle.js';

// The server takes either a package `source` (path or URL, which it installs
// and then restarts the agent) or an inline skill definition.
export default {
    name: 'add',
    aliases: ['install', 'new'],
    description: 'Install a skill from a path/URL, or define one inline',
    positional: [{ name: 'agent' }, { name: 'source' }],
    flags: { name: 'string', description: 'string', prompt: 'string' },
    async run(ctx) {
        const agent = await resolveAgentHandle(ctx);
        const source = ctx.parent.agent ? (ctx.args.agent ?? ctx.args.source) : ctx.args.source;
        const body = source && !ctx.flags.name
            ? { source }
            : {
                name: ctx.flags.name || source,
                description: ctx.flags.description,
                prompt: ctx.flags.prompt,
                source,
            };
        const res = await agent.api.post(agentPath(agent, '/skills'), body);
        const payload = res?.payload || res;
        const skills = Array.isArray(payload) ? payload : payload?.skills || [];
        ctx.io.success(`Installed — '${agent.name}' now has ${skills.length} skill(s)`);
    },
};

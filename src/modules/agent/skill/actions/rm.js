'use strict';

import { UsageError } from '../../../../core/errors.js';
import { resolveAgentHandle, agentPath } from '../../lib/handle.js';

export default {
    name: 'rm',
    aliases: ['remove', 'uninstall', 'delete'],
    description: 'Remove a skill',
    positional: [{ name: 'agent' }, { name: 'skill' }],
    async run(ctx) {
        const agent = await resolveAgentHandle(ctx);
        const skill = ctx.parent.agent ? (ctx.args.agent ?? ctx.args.skill) : ctx.args.skill;
        if (!skill) throw new UsageError('Skill name required');
        await agent.api.delete(agentPath(agent, `/skills/${encodeURIComponent(skill)}`));
        ctx.io.success(`Removed skill '${skill}'`);
    },
};

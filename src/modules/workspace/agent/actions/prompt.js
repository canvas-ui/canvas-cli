'use strict';

import { UsageError } from '../../../../core/errors.js';

export default {
    name: 'prompt',
    description: 'Prompt an agent with workspace context',
    positional: [{ name: 'agent', required: true }, { name: 'message', variadic: true }],
    flags: { steer: 'boolean' },
    async run({ parent, args, flags, stdin, io }) {
        if (!parent.workspace) throw new UsageError('Workspace address required');
        if (!args.agent) throw new UsageError('Agent name required');
        let message = (args.message || []).join(' ').trim();
        if (stdin) {
            const q = message ? `\n\n${message}` : '';
            message = `<stdin>\n${stdin.trimEnd()}\n</stdin>${q}`;
        }
        if (!message) throw new UsageError('Message required');
        message = `[Workspace: ${parent.workspace.full}]\n\n${message}`;
        const out = await parent.workspace.api.agents.prompt(args.agent, {
            message,
            streamingBehavior: flags.steer ? 'steer' : 'followUp',
        });
        printMessages(io, out?.messages || []);
    },
};

function printMessages(io, msgs) {
    for (const msg of msgs) {
        if (!Array.isArray(msg.content)) continue;
        for (const block of msg.content) {
            if (block.type === 'text') process.stdout.write(block.text);
        }
    }
    process.stdout.write('\n');
}

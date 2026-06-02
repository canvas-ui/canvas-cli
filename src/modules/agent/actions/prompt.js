'use strict';

import { UsageError } from '../../../core/errors.js';

export default {
    name: 'prompt',
    description: 'Prompt an agent',
    positional: [{ name: 'agent' }, { name: 'message', variadic: true }],
    flags: {
        workspace: 'string', context: 'string',
        steer: 'boolean', 'streaming-behavior': 'string',
    },
    async run({ parent, args, flags, stdin, client, io }) {
        let agent = parent.agent;
        let messageWords = args.message || [];
        if (!agent) {
            if (!args.agent) throw new UsageError('Agent name required');
            agent = await import('../resolve.js').then((m) => m.default(args.agent, { client }));
        } else if (args.agent) {
            // when called as `agent prompt lucy msg`, agent positional is first message token if no parent
            messageWords = [args.agent, ...messageWords];
        }
        let message = messageWords.join(' ').trim();
        if (stdin) {
            const q = message ? `\n\n${message}` : '';
            message = `<stdin>\n${stdin.trimEnd()}\n</stdin>${q}`;
        }
        if (!message) throw new UsageError('Message required');

        const meta = [];
        if (flags.workspace) meta.push(`Workspace: ${flags.workspace}`);
        if (flags.context) meta.push(`Context: ${flags.context}`);
        if (meta.length) message = `[${meta.join(', ')}]\n\n${message}`;

        const streamingBehavior = flags.steer || flags['streaming-behavior'] === 'steer'
            ? 'steer' : 'followUp';
        const out = await agent.api.agents.prompt(agent.name, { message, streamingBehavior });
        if (out?.queued && (!out.messages || out.messages.length === 0)) {
            io.warn(`Agent busy; accepted as ${out.streamingBehavior === 'steer' ? 'steer' : 'follow-up'}.`);
            return;
        }
        for (const msg of out?.messages || []) {
            if (!Array.isArray(msg.content)) continue;
            for (const block of msg.content) {
                if (block.type === 'text') process.stdout.write(block.text);
            }
        }
        process.stdout.write('\n');
    },
};

import { password } from '../../../core/prompt.js';
'use strict';

import { resolveWorkspaceHandle } from '../lib/handle.js';

export default {
    name: 'start',
    description: 'Start a workspace (--unlock prompts for its PIN/password)',
    flags: { unlock: 'boolean', 'without-secrets': 'boolean' },
    positional: [{ name: 'address' }],
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const options = { withoutSecrets: ctx.flags['without-secrets'] === true };
        if (ctx.flags.unlock) options.passphrase = await password('Workspace PIN/password or recovery key: ');
        await handle.api.workspaces.start(handle.id, options);
        ctx.io.success(`Workspace '${handle.full}' started`);
    },
};

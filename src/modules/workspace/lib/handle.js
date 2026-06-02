'use strict';

import { UsageError } from '../../../core/errors.js';

// Resolve the workspace handle the user is targeting. Order of precedence:
//   1. resourceArg-style positioning: `canvas ws <addr> <action>` → parent.workspace
//   2. positional after the action: `canvas ws show <addr>` → args.address
//   3. flag: `--workspace <addr>`
//   4. stray address-looking token in `rest`
export function resolveWorkspaceHandle({ parent, client, flags, args, rest }) {
    if (parent.workspace) return parent.workspace;
    const positional = args?.address || args?.workspace;
    if (positional) return client.resolve(positional);
    if (flags?.workspace) return client.resolve(flags.workspace);
    const stray = (rest || []).find((t) => typeof t === 'string' && (t.includes('@') || t.includes(':')));
    if (stray) return client.resolve(stray);
    throw new UsageError('Workspace address required (e.g. user@remote:workspace)');
}

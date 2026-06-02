'use strict';

import { UsageError } from '../../../core/errors.js';
import { resolveAlias } from '../../../core/storage.js';

// Resolve the workspace handle for a dot action. Falls back to bound context's
// workspace if no explicit workspace given.
export function resolveHandle({ parent, client, session, flags, args, rest }) {
    if (parent.workspace) return parent.workspace;
    if (flags.workspace) return client.resolve(flags.workspace);
    // Address may be supplied as a positional or as a leftover token
    if (args?.workspace) return client.resolve(args.workspace);
    const stray = (rest || []).find((t) => t.includes('@') || t.includes(':'));
    if (stray) return client.resolve(stray);
    const ctx = session.boundContext();
    if (ctx) {
        const resolved = resolveAlias(ctx);
        // boundContext stores user@remote:contextId — workspace inferred from boundContextUrl scheme
        try {
            const handle = client.resolve(resolved);
            // boundContextUrl looks like `universe://path` — workspace = scheme
            const url = session.get('boundContextUrl');
            const ws = url?.includes('://') ? url.split('://')[0] : null;
            if (ws) {
                return client.resolve(`${resolved.split(':')[0]}:${ws}`);
            }
            return handle;
        } catch { /* fall through */ }
    }
    throw new UsageError('Workspace address required. Pass `user@remote:workspace` or bind a context.');
}

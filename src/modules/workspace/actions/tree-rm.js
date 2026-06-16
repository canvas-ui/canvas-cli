'use strict';

import { resolveWorkspaceHandle } from '../lib/handle.js';
import { UsageError } from '../../../core/errors.js';

// Remove a path from a workspace tree.
//
// Flags:
//   --tree         tree name/id (default: directory — that's where /.incoming lives)
//   -r/--recursive remove children too
//   --purge        also delete the documents under the folder from the index.
//                  Only effective on the /.incoming subtree of a directory tree;
//                  elsewhere documents are kept and only the folder is dropped.
export default {
    name: 'tree-rm',
    description: 'Remove a path from a workspace tree (--purge also deletes ingested docs under /.incoming)',
    positional: [
        { name: 'address' },
        { name: 'path', required: true },
    ],
    flags: { tree: 'string', recursive: 'boolean', purge: 'boolean', force: 'boolean' },
    flagAliases: { r: 'recursive' },
    async run(ctx) {
        const { args, flags, io } = ctx;
        const handle = resolveWorkspaceHandle(ctx);

        // `canvas ws tree-rm <addr> <path>` → args.path. In the resource-first form
        // `canvas ws <addr> tree-rm <path>` the workspace is consumed by the parent,
        // so the lone positional lands in args.address — fall back to it when it
        // looks like a path (addresses never start with '/').
        let raw = args.path;
        if (!raw && typeof args.address === 'string' && args.address.startsWith('/')) raw = args.address;
        if (!raw) throw new UsageError('Path required');
        const path = String(raw).startsWith('/') ? raw : `/${raw}`;
        const tree = flags.tree || 'directory';
        const recursive = Boolean(flags.recursive);
        const purge = Boolean(flags.purge);

        if (purge && !flags.force) {
            io.warn(`Will remove '${path}' from tree '${tree}' AND purge every document under it from the index. Pass --force.`);
            return;
        }

        const result = await handle.api.workspaces.removeTreePath(handle.id, tree, path, { recursive, purge });
        if (purge) {
            io.success(`Removed '${path}' and purged ${result?.purged || 0} document(s)`);
        } else {
            io.success(`Removed '${path}'`);
        }
    },
};

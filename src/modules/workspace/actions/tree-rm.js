'use strict';

import { resolveWorkspaceHandle } from '../lib/handle.js';
import { UsageError } from '../../../core/errors.js';

// Remove a path from a workspace tree.
//
// Flags:
//   --tree         tree name/id (default: directory; backend mirrors live in the 'backends' tree)
//   -r/--recursive remove children too
//   --purge        also delete the documents under the folder from the index.
//                  Only effective inside the backends tree; elsewhere documents
//                  are kept and only the folder is dropped.
//   --destroy      like --purge, but ALSO deletes the mirrored files/messages on
//                  the backend itself (rw backends only; read-only locations are
//                  reference-dropped). Only effective inside the backends tree.
export default {
    name: 'tree-rm',
    description: 'Remove a path from a workspace tree (--purge deletes ingested docs in the backends tree; --destroy also deletes them on the backend)',
    positional: [
        { name: 'address' },
        { name: 'path', required: true },
    ],
    flags: { tree: 'string', recursive: 'boolean', purge: 'boolean', destroy: 'boolean', force: 'boolean' },
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
        const destroy = Boolean(flags.destroy);
        const purge = Boolean(flags.purge) || destroy;

        if (destroy && !flags.force) {
            io.warn(`Will remove '${path}' from tree '${tree}', purge every document under it from the index AND permanently delete the mirrored resources on the backend. Pass --force.`);
            return;
        }
        if (purge && !flags.force) {
            io.warn(`Will remove '${path}' from tree '${tree}' AND purge every document under it from the index. Pass --force.`);
            return;
        }

        const result = await handle.api.workspaces.removeTreePath(handle.id, tree, path, { recursive, purge, destroy });
        if (destroy) {
            const d = result?.destroyed || {};
            io.success(`Removed '${path}': ${(d.docsDestroyed || 0) + (d.docsPurged || 0)} document(s) purged, ${d.deletedLocations || 0} location(s) destroyed on backend`);
        } else if (purge) {
            io.success(`Removed '${path}' and purged ${result?.purged || 0} document(s)`);
        } else {
            io.success(`Removed '${path}'`);
        }
    },
};

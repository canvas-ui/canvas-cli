'use strict';

import { UsageError, AuthError } from '../../../core/errors.js';
import { unwrapResource } from '../../../core/api-helpers.js';

export default {
    name: 'create',
    description: 'Create a context',
    positional: [{ name: 'id', required: true }, { name: 'url' }],
    flags: {
        description: 'string', color: 'string', name: 'string',
        url: 'string', 'base-url': 'string', tree: 'string',
    },
    async run({ args, flags, client, session, io }) {
        const url = flags.url || args.url || '';
        // `--workspace` may be a bare name or a full address; an address also
        // decides which remote the context is created on.
        const handle = flags.workspace ? client.resolve(flags.workspace) : null;
        const remoteId = handle?.remoteId || session.boundRemote();
        if (!remoteId) throw new AuthError('No remote bound');
        const api = client.client(remoteId);

        // A workspace can be named twice — `--workspace` and the url's scheme.
        // Silently preferring one would create the context somewhere the other
        // half of the command said it would not.
        const urlWorkspace = url.includes('://') ? url.slice(0, url.indexOf('://')) : null;
        const workspace = handle?.id || urlWorkspace || null;
        if (handle && urlWorkspace && handle.id !== urlWorkspace) {
            throw new UsageError(
                `Workspace mismatch: --workspace ${handle.id} but --url ${url}. Name it once.`,
            );
        }

        const data = { id: args.id, description: flags.description || '', metadata: {} };
        if (flags.name) data.name = flags.name;
        if (url) data.url = normalizePath(url);
        if (flags['base-url']) data.baseUrl = normalizePath(flags['base-url']);
        // Without this the server falls back to the user's primary workspace,
        // which is right for a bare path and wrong for `--workspace work`.
        if (handle) data.workspaceId = handle.id;
        const { treeLabel, ...tree } = await resolveTree(api, workspace, flags.tree);
        Object.assign(data, tree);
        if (flags.color) data.metadata.color = flags.color;

        const created = unwrapResource(await api.contexts.create(data), 'context');
        io.success(`Context '${args.id}' created`);
        io.output(created, {
            columns: [
                'id', 'url', 'workspaceName', 'path',
                ...(created?.baseUrl && created.baseUrl !== '/' ? [{ key: 'baseUrl', label: 'base' }] : []),
                // Only when it was asked for: every context has a treeId, and
                // echoing a bare ULID nobody chose is noise, not information.
                ...(treeLabel ? [{ label: 'tree', get: () => treeLabel }] : []),
                'createdAt',
            ],
        });
    },
};

const asList = (payload) => (Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.payload) ? payload.payload : []));

/** `foo/bar` → `/foo/bar`; a `ws://…` url is already absolute. */
function normalizePath(value) {
    const v = String(value);
    return v.includes('://') || v.startsWith('/') ? v : `/${v}`;
}

/**
 * `--tree` takes a name or an id, the way every other tree-aware route does
 * (`treeNameOrTreeId`). Create is the one place that only understood ids, so a
 * context could not be pinned to the directory tree from the CLI at all.
 *
 * @returns {Promise<Object>} `{treeId, treeLabel}`, `{treeType}`, or `{}`
 */
async function resolveTree(api, workspace, spec) {
    if (!spec) return {};
    // 'context' and 'directory' are also tree *types*, so they resolve without
    // a workspace to look in — the server picks that workspace's default.
    const isType = spec === 'context' || spec === 'directory';
    if (!workspace) {
        if (isType) return { treeType: spec, treeLabel: spec };
        throw new UsageError(
            `--tree ${spec} needs a workspace to look in: add --workspace <name> or a full --url <workspace>://<path>`,
        );
    }
    const trees = asList(await api.workspaces.trees(workspace).catch(() => null));
    const hit = trees.find((t) => t?.id === spec) || trees.find((t) => t?.name === spec);
    if (hit) return { treeId: hit.id, treeLabel: hit.name };
    if (isType) return { treeType: spec, treeLabel: spec };
    const known = trees.map((t) => `${t.name} (${t.type})`).join(', ');
    throw new UsageError(
        `Unknown tree '${spec}' in workspace '${workspace}'${known ? `. Available: ${known}` : ''}`,
    );
}

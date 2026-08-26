'use strict';

import { clientAppFeature, tagsToFeatures } from '@augmentd-labs/canvas-schemas';
import { docScope } from './doc-scope.js';
import { listColumns, detailColumns, title as docTitle } from './doc-render.js';
import { UsageError } from './errors.js';

const CLIENT_FEATURE = clientAppFeature('canvas-cli');

/**
 * Build a noun submodule for one document schema.
 *
 * The result is an ordinary module object — the same shape `backends/index.js`
 * has — so the dispatcher needs no special case: nouns are submodules and
 * verbs are actions, exactly like everywhere else.
 *
 * @param {Object} o
 * @param {string} o.name singular noun, e.g. 'note'
 * @param {string} [o.plural] defaults to `${name}s`
 * @param {string[]} [o.aliases]
 * @param {string[]} [o.aliasPlurals] plurals of the aliases (todo → todos)
 * @param {string|null} o.schema `data/schema/note`; null means "every schema"
 * @param {string} o.description
 * @param {'context'|'workspace'} o.scope
 * @param {(ctx: Object) => Object|Object[]} [o.build] args/flags → document(s);
 *        omitted ⇒ the noun is read-only (no `add` verb)
 * @param {Object[]} [o.addPositional] defaults to a variadic required `body`
 * @param {Object} [o.addFlags] extra flags for `add`
 * @param {(ctx: Object) => Promise<any>} [o.addRun] replaces the whole `add`
 *        body (the file noun streams bytes instead of building a document)
 * @param {Object[]} [o.extraVerbs] additional actions
 * @returns {Object} module
 */
export function createDocNoun(o) {
    const {
        name, plural, aliases = [], aliasPlurals = [], schema, description, scope,
        build, addPositional, addFlags = {}, addRun, extraVerbs = [],
    } = o;

    const listVerb = {
        name: 'list',
        aliases: ['ls'],
        description: `List ${description.toLowerCase()}`,
        positional: [{ name: 'query' }],
        flags: {
            feature: 'string', filter: 'string',
            ...(scope === 'context' ? { all: 'boolean' } : {}),
            ...(scope === 'workspace' ? { 'context-path': 'string', tree: 'string' } : {}),
        },
        async run(ctx) {
            const s = await docScope(ctx, scope);
            const docs = await s.list({
                q: ctx.args.query,
                // The noun's own schema is always ANDed in, so `note list` can
                // never answer with tabs.
                feature: [schema, ctx.flags.feature].flat().filter(Boolean),
                filter: ctx.flags.filter,
                context: ctx.flags['context-path'],
                treeNameOrTreeId: ctx.flags.tree,
                // A context lists through its saved view by default, the way
                // the web does; --all ignores it.
                ...(ctx.flags.all ? { applyContextSpec: false } : {}),
            });
            if (docs.length === 0 && !ctx.flags.all && ctx.io.format === 'table') {
                // An empty listing has two very different causes, and `(empty)`
                // tells them apart for neither: nothing is here, or the
                // context's saved view hides what is. Say which.
                const view = await s.savedView().catch(() => null);
                if (view) {
                    ctx.io.info(`(empty) — this context filters to ${view}`);
                    ctx.io.info(`Use \`--all\` to list past it, or clear it in the web toolbox.`);
                    return;
                }
            }
            // Per-schema columns: a note lists its preview, a file its size
            // and where the bytes live. Mixed results (`doc list`) fall back
            // to the generic row.
            ctx.io.output(docs, { columns: listColumns(schema) });
        },
    };

    const getVerb = {
        name: 'get',
        aliases: ['show', 'cat'],
        description: `Show one ${name}`,
        positional: [{ name: 'docId', required: true }],
        async run(ctx) {
            const s = await docScope(ctx, scope);
            const doc = await s.get(ctx.args.docId);
            ctx.io.detail(doc, { columns: detailColumns(doc), title: docTitle(doc) || undefined });
        },
    };

    // rm unlinks, delete destroys. The old `notes`/`tabs` actions had both
    // behind two indistinguishable op strings ('remove' vs 'delete'); as verbs
    // the difference is visible, and the destructive one asks for --force.
    const rmVerb = {
        name: 'rm',
        aliases: ['remove'],
        description: `Remove ${name}(s) from this ${scope} (the document survives)`,
        positional: [{ name: 'docId', variadic: true, required: true }],
        async run(ctx) {
            const s = await docScope(ctx, scope);
            const ids = ctx.args.docId;
            await s.remove(ids);
            ctx.io.success(`Removed ${ids.length} ${name}(s) from ${s.id}`);
        },
    };

    const deleteVerb = {
        name: 'delete',
        aliases: ['destroy'],
        description: `Delete ${name}(s) permanently (--force)`,
        positional: [{ name: 'docId', variadic: true, required: true }],
        flags: { force: 'boolean' },
        async run(ctx) {
            if (!ctx.flags.force) {
                throw new UsageError(
                    `Refusing to delete ${ctx.args.docId.length} document(s) without --force. ` +
                    `Did you mean \`${name} rm\`, which only unlinks them from this ${scope}?`,
                );
            }
            const s = await docScope(ctx, scope);
            await s.destroy(ctx.args.docId);
            ctx.io.success(`Deleted ${ctx.args.docId.length} ${name}(s)`);
        },
    };

    const actions = [listVerb, getVerb, rmVerb, deleteVerb, ...extraVerbs];

    if (build || addRun) {
        actions.push({
            name: 'add',
            aliases: ['new'],
            description: `Add a ${name}`,
            positional: addPositional || [{ name: 'body', variadic: true, required: true }],
            flags: {
                title: 'string', tag: 'string', comment: 'string',
                ...(scope === 'workspace' ? { path: 'string' } : {}),
                ...addFlags,
            },
            async run(ctx) {
                if (addRun) return addRun(ctx);
                const s = await docScope(ctx, scope);
                const docs = [build(ctx)].flat();
                const features = [
                    ...(schema ? [schema] : []),
                    ...tagsToFeatures(ctx.flags.tag),
                    CLIENT_FEATURE,
                ];
                const created = await s.insert(docs, features, targetsFor(ctx, scope));
                const ids = idsOf(created);
                ctx.io.success(`Added ${docs.length} ${name}(s)${ids.length ? ` (${ids.join(', ')})` : ''}`);
            },
        });
    }

    return {
        name,
        aliases,
        pluralAlias: plural || `${name}s`,
        aliasPlurals,
        description,
        defaultAction: 'list',
        defaultPluralAction: 'list',
        needsConnection: true,
        actions,
        submodules: [],
    };
}

// Workspace inserts can name a tree path; context inserts cannot (a context is
// already a path). Kept here so no noun has to know the difference.
function targetsFor(ctx, scope) {
    if (scope !== 'workspace' || !ctx.flags.path) return {};
    const spec = String(ctx.flags.path);
    const idx = spec.indexOf(':');
    if (spec.startsWith('/') || idx < 0) return { context: spec.startsWith('/') ? spec : `/${spec}` };
    const tree = spec.slice(0, idx);
    let path = spec.slice(idx + 1) || '/';
    if (!path.startsWith('/')) path = `/${path}`;
    return { treeNameOrTreeId: tree, context: path };
}

function idsOf(created) {
    const list = Array.isArray(created) ? created : created?.documents || created?.payload || [];
    return (Array.isArray(list) ? list : []).map((d) => d?.id ?? d).filter((v) => v != null);
}

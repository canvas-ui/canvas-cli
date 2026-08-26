'use strict';

import {
    SCHEMA_NOTE, SCHEMA_TAB, SCHEMA_FILE, SCHEMA_TASK, SCHEMA_LINK,
    SCHEMA_DOTFILE, SCHEMA_EMAIL, SCHEMA_IDENTITY,
    buildNoteDoc, buildTabDoc, buildTaskDoc, buildLinkDoc,
} from '@augmentd-labs/canvas-schemas';
import { createDocNoun } from './doc-noun.js';
import { ingestPath } from '../modules/workspace/lib/fileingest.js';

const joinBody = (body) => (Array.isArray(body) ? body.join(' ') : String(body ?? ''));

/**
 * The noun vocabulary. A noun is a document schema, so this table is a
 * mapping, not an invention: labels agree with the web
 * (apps/web/src/lib/schema-meta.ts) and the ids come from the same package the
 * server's registry serves at /rest/v2/schemas.
 *
 * Nouns without a `build` are read-only: nothing in the CLI creates an email
 * or an identity (connectors and the web do), and a dotfile document without
 * the matching file in the git repo is half a record — `canvas dot add` owns
 * that write.
 */
export const DOC_NOUNS = [
    {
        name: 'note', schema: SCHEMA_NOTE, description: 'Notes',
        build: ({ args, flags }) => buildNoteDoc(joinBody(args.body), {
            title: flags.title, comment: flags.comment, tags: flags.tag,
        }),
    },
    {
        name: 'tab', schema: SCHEMA_TAB, description: 'Browser tabs',
        addPositional: [{ name: 'url', required: true }],
        build: ({ args, flags }) => buildTabDoc(args.url, {
            title: flags.title, tags: flags.tag,
        }),
    },
    {
        name: 'todo', plural: 'todos', aliases: ['task'], aliasPlurals: ['tasks'],
        schema: SCHEMA_TASK, description: 'Todos',
        addFlags: { due: 'string', status: 'string', 'task-priority': 'string' },
        build: ({ args, flags }) => buildTaskDoc(joinBody(args.body), {
            description: flags.description,
            status: flags.status,
            dueDate: flags.due,
            priority: flags['task-priority'] ? Number(flags['task-priority']) : undefined,
            comment: flags.comment,
            tags: flags.tag,
        }),
    },
    {
        name: 'link', schema: SCHEMA_LINK, description: 'Links',
        addPositional: [{ name: 'uri', required: true }],
        build: ({ args, flags }) => buildLinkDoc(args.uri, {
            label: flags.title, description: flags.description,
            comment: flags.comment, tags: flags.tag,
        }),
    },
    {
        name: 'file', schema: SCHEMA_FILE, description: 'Files',
        addPositional: [{ name: 'source', required: true }, { name: 'rest', variadic: true }],
        addFlags: {
            directory: 'string', exclude: 'string', timeline: 'string',
            'no-defaults': 'boolean', 'dry-run': 'boolean', 'batch-size': 'string',
        },
        // Files are not built, they are streamed: `add` uploads the bytes,
        // `index` records a device pointer and leaves them where they are.
        addRun: (ctx) => ingest(ctx, 'upload'),
        extraVerbs: [
            {
                name: 'upload',
                description: 'Upload file(s)/dir — bytes stored server-side, embeddable',
                positional: [{ name: 'source', required: true }, { name: 'rest', variadic: true }],
                flags: {
                    path: 'string', directory: 'string', exclude: 'string', timeline: 'string',
                    'no-defaults': 'boolean', 'dry-run': 'boolean', 'batch-size': 'string',
                },
                flagAliases: { d: 'directory' },
                needsConnection: false,
                run: (ctx) => ingest(ctx, 'upload'),
            },
            {
                name: 'index',
                description: 'Index file(s)/dir in place — bytes stay on this device',
                positional: [{ name: 'source', required: true }, { name: 'rest', variadic: true }],
                flags: {
                    path: 'string', directory: 'string', exclude: 'string',
                    'no-defaults': 'boolean', 'dry-run': 'boolean', 'batch-size': 'string',
                },
                flagAliases: { d: 'directory' },
                needsConnection: false,
                run: (ctx) => ingest(ctx, 'index'),
            },
        ],
    },
    { name: 'email', schema: SCHEMA_EMAIL, description: 'Emails' },
    { name: 'identity', plural: 'identities', schema: SCHEMA_IDENTITY, description: 'Identities' },
    { name: 'dotfile', schema: SCHEMA_DOTFILE, description: 'Dotfiles (read-only; see `canvas dot`)' },
    // Schema-less: every document, whatever it is. This is the old
    // `ctx documents` / `ws documents`, and the escape hatch for a schema the
    // table does not name (`doc list --feature data/schema/event`).
    { name: 'doc', plural: 'docs', aliases: ['document'], schema: null, description: 'Any document' },
];

async function ingest(ctx, mode) {
    const scope = ctx.module?.docScope || 'context';
    if (scope === 'workspace') {
        const { resolveWorkspaceHandle } = await import('../modules/workspace/lib/handle.js');
        const { workspaceAdapter } = await import('../modules/workspace/lib/adapter.js');
        return ingestPath(ctx, { mode, adapter: workspaceAdapter(resolveWorkspaceHandle(ctx)) });
    }
    const { resolveContextHandle, contextAdapter } = await import('../modules/context/lib/handle.js');
    return ingestPath(ctx, { mode, adapter: contextAdapter(resolveContextHandle(ctx)), useTargets: false });
}

/**
 * The noun submodules for one container.
 * @param {'context'|'workspace'} scope
 */
export function documentNouns(scope) {
    return DOC_NOUNS.map((n) => {
        const mod = createDocNoun({ ...n, scope });
        // The file noun's verbs resolve their adapter at run time and need to
        // know which container they are mounted on.
        mod.docScope = scope;
        return mod;
    });
}

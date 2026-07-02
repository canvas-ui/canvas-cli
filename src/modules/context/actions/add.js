'use strict';

import { ingestPath } from '../../workspace/lib/fileingest.js';
import { resolveContextHandle, contextAdapter } from './upload.js';
import { buildNoteDoc, buildTabDoc, tagsToFeatures } from '../../workspace/lib/docbuilders.js';
import { UsageError } from '../../../core/errors.js';

const NOTE_TYPES = new Set(['note']);
const LINK_TYPES = new Set(['link', 'tab', 'url']);

// `add` = friendly default: create a note/link/tab, OR add local file(s)/dir to the
// context. For files it UPLOADS (bytes → workspace, embeddable) — same as `upload`.
// Use `index` to instead record a device pointer without uploading.
export default {
    name: 'add',
    description: 'Add a note/link, or upload local file(s)/dir into a context',
    positional: [
        { name: 'type', required: true },
        { name: 'body', variadic: true },
    ],
    // No path/tree flags — a context inserts at its own focused path (conservative).
    flags: {
        exclude: 'string',
        timeline: 'string',
        'no-defaults': 'boolean',
        'dry-run': 'boolean',
        'batch-size': 'string',
    },
    needsConnection: false,

    async run(ctx) {
        const { args } = ctx;
        if (!args.type) throw new UsageError('Type or path required (note, link, /path/to/file)');
        if (NOTE_TYPES.has(args.type)) return _addNote(ctx);
        if (LINK_TYPES.has(args.type)) return _addLink(ctx);
        // Anything else is a file/dir path → upload (bytes to the workspace).
        const handle = resolveContextHandle(ctx);
        return ingestPath(ctx, { mode: 'upload', adapter: contextAdapter(handle), useTargets: false });
    },
};

// Insert at the context's focused path — the context resolves placement, so we send
// only documents + features (no path/tree targeting).
async function _insert(handle, docs, features) {
    const created = await handle.api.contexts.insertDocuments(handle.id, { documents: docs, features });
    return (Array.isArray(created) ? created : created?.documents || []).map(d => d.id).filter(Boolean);
}

async function _addNote(ctx) {
    const { args, flags, io } = ctx;
    const handle = resolveContextHandle(ctx);

    const bodyTokens = Array.isArray(args.body) ? args.body : (args.body ? [args.body] : []);
    const content = bodyTokens.join(' ').trim();
    if (!content) throw new UsageError('Note content required');

    const ids = await _insert(handle, [buildNoteDoc(content, flags.title)], ['data/abstraction/note']);
    io.success(`Note created (${ids[0] || '?'})`);
}

async function _addLink(ctx) {
    const { args, flags, io } = ctx;
    const handle = resolveContextHandle(ctx);

    const bodyTokens = Array.isArray(args.body) ? args.body : (args.body ? [args.body] : []);
    const url = bodyTokens[0];
    if (!url) throw new UsageError('URL required');

    const rawTags = flags.tag;
    const tags = Array.isArray(rawTags) ? rawTags : (rawTags ? [rawTags] : []);
    const features = ['data/abstraction/tab', ...tagsToFeatures(tags)];

    const ids = await _insert(handle, [buildTabDoc(url, { title: flags.title })], features);
    io.success(`Link saved (${ids[0] || '?'})`);
}

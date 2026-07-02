'use strict';

import { resolveWorkspaceHandle } from '../lib/handle.js';
import { ingestPath } from '../lib/fileingest.js';
import { workspaceAdapter } from './upload.js';
import { buildNoteDoc, buildTabDoc, tagsToFeatures, parseTargets, targetBody } from '../lib/docbuilders.js';
import { UsageError } from '../../../core/errors.js';

const NOTE_TYPES = new Set(['note']);
const LINK_TYPES = new Set(['link', 'tab', 'url']);

// `add` = the friendly default: create a note/link/tab, OR add local file(s)/dir.
// For files it UPLOADS (bytes → server, embeddable) — same as `upload`. Use `index`
// to instead record a device pointer without uploading.
//
// Flags: --path treeName:/path (repeatable), -c/--context, -d/--directory, -t/--tag,
//        --title (note/link), --timeline (content date; files), --exclude,
//        --no-defaults, --dry-run, --batch-size.
export default {
    name: 'add',
    description: 'Add a note/link, or upload local file(s)/dir into a workspace',
    positional: [
        { name: 'type', required: true },
        { name: 'body', variadic: true },
    ],
    flags: {
        path: 'string',
        directory: 'string',
        exclude: 'string',
        timeline: 'string',
        'no-defaults': 'boolean',
        'dry-run': 'boolean',
        'batch-size': 'string',
    },
    flagAliases: { d: 'directory' },
    needsConnection: false,

    async run(ctx) {
        const { args } = ctx;
        if (!args.type) throw new UsageError('Type or path required (note, link, /path/to/file)');

        if (NOTE_TYPES.has(args.type)) return _addNote(ctx);
        if (LINK_TYPES.has(args.type)) return _addLink(ctx);
        // Anything else is treated as a file/dir path → upload (bytes to server).
        const handle = resolveWorkspaceHandle(ctx);
        return ingestPath(ctx, { mode: 'upload', adapter: workspaceAdapter(handle) });
    },
};

async function _insertToTargets(api, id, docs, features, targets) {
    const primary = targets[0];
    const created = await api.workspaces.insertDocuments(id, { documents: docs, features, ...targetBody(primary) });
    const ids = (Array.isArray(created) ? created : created?.documents || []).map(d => d.id).filter(Boolean);
    for (const target of targets.slice(1)) {
        await api.workspaces.insertDocuments(id, { documentIds: ids, ...targetBody(target) });
    }
    return ids;
}

async function _addNote(ctx) {
    const { args, flags, io } = ctx;
    const handle = resolveWorkspaceHandle(ctx);
    const targets = parseTargets(flags);

    const bodyTokens = Array.isArray(args.body) ? args.body : (args.body ? [args.body] : []);
    const content = bodyTokens.join(' ').trim();
    if (!content) throw new UsageError('Note content required');

    const doc = buildNoteDoc(content, flags.title);
    const ids = await _insertToTargets(handle.api, handle.id, [doc], ['data/abstraction/note'], targets);
    io.success(`Note created (${ids[0] || '?'})`);
}

async function _addLink(ctx) {
    const { args, flags, io } = ctx;
    const handle = resolveWorkspaceHandle(ctx);
    const targets = parseTargets(flags);

    const bodyTokens = Array.isArray(args.body) ? args.body : (args.body ? [args.body] : []);
    const url = bodyTokens[0];
    if (!url) throw new UsageError('URL required');

    const rawTags = flags.tag;
    const tags = Array.isArray(rawTags) ? rawTags : (rawTags ? [rawTags] : []);
    const features = ['data/abstraction/tab', ...tagsToFeatures(tags)];

    const doc = buildTabDoc(url, { title: flags.title });
    const ids = await _insertToTargets(handle.api, handle.id, [doc], features, targets);
    io.success(`Link saved (${ids[0] || '?'})`);
}

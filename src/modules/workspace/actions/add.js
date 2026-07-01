'use strict';

import { stat } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { resolveWorkspaceHandle } from '../lib/handle.js';
import { walkFiles, ingestFile } from '../lib/ingest.js';
import { buildNoteDoc, buildTabDoc, tagsToFeatures, parseTargets, targetBody } from '../lib/docbuilders.js';
import device from '../../dot/lib/device.js';
import { UsageError } from '../../../core/errors.js';

const statAsync = promisify(stat);
const BATCH_SIZE = 50;

const NOTE_TYPES = new Set(['note']);
const LINK_TYPES = new Set(['link', 'tab', 'url']);

// Flags:
//   --path             target as treeName:/path or /path (default context tree), repeatable
//   -c / --context     [legacy] context-tree path(s) to place under (repeatable)
//   -d / --directory   [legacy] directory-tree path (flagAliases overrides global -d:debug)
//   -t / --tag         tag(s) as custom/tag/<t> features (repeatable)
//   --title            document title (note/link)
//   --exclude          extra names to exclude from directory scan (comma-separated)
//   --no-defaults      skip default exclusion list
//   --dry-run          scan only, no network (files only)
//   --batch-size       docs per POST batch (default 50)

export default {
    name: 'add',
    description: 'Index a note, link, or local file/directory into a workspace',
    positional: [
        { name: 'type', required: true },
        { name: 'body', variadic: true },
    ],
    flags: {
        path: 'string',
        directory: 'string',
        exclude: 'string',
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
        return _addFiles(ctx);
    },
};

async function _resolveTargetsAndHandle(ctx) {
    const handle = resolveWorkspaceHandle(ctx);
    const targets = parseTargets(ctx.flags);
    return { handle, targets };
}

async function _insertToTargets(api, id, docs, features, targets) {
    const primary = targets[0];
    const created = await api.workspaces.insertDocuments(id, {
        documents: docs,
        features,
        ...targetBody(primary),
    });
    const ids = (Array.isArray(created) ? created : created?.documents || [])
        .map(d => d.id).filter(Boolean);
    for (const target of targets.slice(1)) {
        await api.workspaces.insertDocuments(id, {
            documentIds: ids,
            ...targetBody(target),
        });
    }
    return ids;
}

async function _addNote(ctx) {
    const { args, flags, io } = ctx;
    const { handle, targets } = await _resolveTargetsAndHandle(ctx);

    const bodyTokens = Array.isArray(args.body) ? args.body : (args.body ? [args.body] : []);
    const content = bodyTokens.join(' ').trim();
    if (!content) throw new UsageError('Note content required');

    const doc = buildNoteDoc(content, flags.title);
    const ids = await _insertToTargets(handle.api, handle.id, [doc], ['data/abstraction/note'], targets);
    io.success(`Note created (${ids[0] || '?'})`);
}

async function _addLink(ctx) {
    const { args, flags, io } = ctx;
    const { handle, targets } = await _resolveTargetsAndHandle(ctx);

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

async function _addFiles(ctx) {
    const { args, flags, io } = ctx;
    const handle = resolveWorkspaceHandle(ctx);
    const targets = parseTargets(flags);
    const absPath = resolve(args.type);
    const deviceId = device.id;

    const extraExclude = flags.exclude
        ? String(flags.exclude).split(',').map(s => s.trim()).filter(Boolean)
        : [];
    const noDefaults = Boolean(flags['no-defaults']);
    const isDryRun = Boolean(flags['dry-run']);
    const batchSize = parseInt(flags['batch-size'] ?? String(BATCH_SIZE), 10) || BATCH_SIZE;

    let pathStat;
    try { pathStat = await statAsync(absPath); }
    catch { throw new UsageError(`Path not found: ${absPath}`); }
    if (!pathStat.isFile() && !pathStat.isDirectory()) {
        throw new UsageError('Path must be a regular file or directory');
    }

    const files = [];
    if (pathStat.isDirectory()) {
        io.info(`Scanning ${absPath} ...`);
        for await (const fp of walkFiles(absPath, { exclude: extraExclude, noDefaults })) {
            files.push(fp);
        }
        io.info(`Found ${files.length} file(s)`);
    } else {
        files.push(absPath);
    }

    if (files.length === 0) { io.warn('No files to index'); return; }

    if (isDryRun) {
        const preview = files.slice(0, 30);
        preview.forEach(f => io.print(f));
        if (files.length > 30) io.print(`... and ${files.length - 30} more`);
        io.print(`\nTotal: ${files.length} file(s) — dry run, nothing sent`);
        return;
    }

    try { await handle.api.workspaces.start(handle.id); } catch { /* already started */ }

    let indexed = 0;
    let failed = 0;
    let batch = [];

    const flush = async (docs) => {
        const primary = targets[0];
        const created = await handle.api.workspaces.insertDocuments(handle.id, {
            documents: docs,
            features: ['data/abstraction/file'],
            ...targetBody(primary),
        });
        const ids = (Array.isArray(created) ? created : created?.documents || [])
            .map(d => d.id).filter(Boolean);
        for (const target of targets.slice(1)) {
            await handle.api.workspaces.insertDocuments(handle.id, {
                documentIds: ids,
                ...targetBody(target),
            });
        }
    };

    for (const fp of files) {
        try {
            const doc = await ingestFile(fp, deviceId);
            batch.push(doc);
            if (batch.length >= batchSize) {
                await flush(batch);
                indexed += batch.length;
                batch = [];
                io.print(`  ${indexed}/${files.length} indexed...`);
            }
        } catch (e) {
            failed++;
            io.warn(`  skip ${fp}: ${e.message}`);
        }
    }

    if (batch.length > 0) {
        await flush(batch);
        indexed += batch.length;
    }

    const targetDesc = targets.map(t => `${t.treeNameOrTreeId || t.treeType || 'context'}:${t.context}`).join(', ');
    io.success(
        `Indexed ${indexed} file(s) into ${handle.id} [${targetDesc}]` +
        (failed ? `  (${failed} skipped)` : ''),
    );
}

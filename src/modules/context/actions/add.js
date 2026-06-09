'use strict';

import { stat } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { walkFiles, ingestFile } from '../../workspace/lib/ingest.js';
import { buildNoteDoc, buildTabDoc, tagsToFeatures, parseTargets } from '../../workspace/lib/docbuilders.js';
import device from '../../dot/lib/device.js';
import { UsageError } from '../../../core/errors.js';

const statAsync = promisify(stat);
const BATCH_SIZE = 50;

const NOTE_TYPES = new Set(['note']);
const LINK_TYPES = new Set(['link', 'tab', 'url']);

// Flags:
//   -c / --context     tree context path(s) to place under (repeatable)
//   -d / --directory   directory-tree path
//   -t / --tag         tag(s) as custom/tag/<t> features (repeatable)
//   --title            document title
//   --exclude          extra names to exclude from directory scan (comma-separated)
//   --no-defaults      skip default exclusion list
//   --dry-run          scan only, no network (files only)
//   --batch-size       docs per POST batch (default 50)

export default {
    name: 'add',
    description: 'Add a note, link, or local file to a context',
    positional: [
        { name: 'type', required: true },
        { name: 'body', variadic: true },
    ],
    flags: {
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

function _resolveHandle({ parent, client, session }) {
    if (parent.context) return parent.context;
    const bound = session.boundContext();
    if (bound) return client.resolve(bound);
    throw new UsageError('Context required — bind one with `ctx bind` or address it directly');
}

async function _insertToTargets(api, id, docs, features, targets) {
    const primary = targets[0];
    const created = await api.contexts.insertDocuments(id, {
        documents: docs,
        features,
        context: primary.context,
        treeType: primary.treeType,
    });
    const ids = (Array.isArray(created) ? created : created?.documents || [])
        .map(d => d.id).filter(Boolean);
    for (const target of targets.slice(1)) {
        await api.contexts.insertDocuments(id, {
            documentIds: ids,
            context: target.context,
            treeType: target.treeType,
        });
    }
    return ids;
}

async function _addNote(ctx) {
    const { args, flags, io } = ctx;
    const handle = _resolveHandle(ctx);
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
    const handle = _resolveHandle(ctx);
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

async function _addFiles(ctx) {
    const { args, flags, io } = ctx;
    const handle = _resolveHandle(ctx);
    const targets = parseTargets(flags);
    const absPath = resolve(args.type);
    const deviceId = device.id;

    const extraExclude = flags.exclude
        ? String(flags.exclude).split(',').map(s => s.trim()).filter(Boolean)
        : [];
    const noDefaults = Boolean(flags['no-defaults']);
    const isDryRun = Boolean(flags['dry-run']);
    const batchSize = parseInt(flags['batch-size'] || String(BATCH_SIZE), 10) || BATCH_SIZE;

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

    let indexed = 0;
    let failed = 0;
    let batch = [];

    const flush = async (docs) => {
        const primary = targets[0];
        const created = await handle.api.contexts.insertDocuments(handle.id, {
            documents: docs,
            features: ['data/abstraction/file'],
            context: primary.context,
            treeType: primary.treeType,
        });
        const ids = (Array.isArray(created) ? created : created?.documents || [])
            .map(d => d.id).filter(Boolean);
        for (const target of targets.slice(1)) {
            await handle.api.contexts.insertDocuments(handle.id, {
                documentIds: ids,
                context: target.context,
                treeType: target.treeType,
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

    const targetDesc = targets.map(t => `${t.treeType}:${t.context}`).join(', ');
    io.success(
        `Indexed ${indexed} file(s) into ${handle.id} [${targetDesc}]` +
        (failed ? `  (${failed} skipped)` : ''),
    );
}

'use strict';

import { stat, createReadStream } from 'node:fs';
import { resolve, basename } from 'node:path';
import { promisify } from 'node:util';
import { resolveWorkspaceHandle } from '../lib/handle.js';
import { walkFiles, guessMime } from '../lib/ingest.js';
import { parseTargets, targetBody, tagsToFeatures } from '../lib/docbuilders.js';
import { UsageError } from '../../../core/errors.js';

const statAsync = promisify(stat);
const BATCH_SIZE = 50;

// `insert` = UPLOAD (bytes → server blob store → stored:// → embeddable), vs
// `add` = index in place (device file:// pointer, not server-resident). Each file
// is uploaded to workspace:data, then a data/abstraction/file document referencing
// the stored:// location is created (batched). Plaintext files then embed directly
// as files — no MD→note conversion needed.
//
// Flags mirror `add`: --path treeName:/path (repeatable), -c/--context, -d/--directory,
// -t/--tag, --exclude, --no-defaults, --dry-run, --batch-size.
export default {
    name: 'insert',
    description: 'Upload local file(s)/dir into a workspace (bytes stored server-side, embeddable)',
    positional: [
        { name: 'source', required: true },
        { name: 'rest', variadic: true },
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
    needsConnection: true,

    async run(ctx) {
        const { args, flags, io } = ctx;
        if (!args.source) throw new UsageError('Path required: canvas ws insert /path/to/file-or-dir');

        const handle = resolveWorkspaceHandle(ctx);
        const targets = parseTargets(flags);
        const absPath = resolve(args.source);

        const extraExclude = flags.exclude
            ? String(flags.exclude).split(',').map(s => s.trim()).filter(Boolean)
            : [];
        const noDefaults = Boolean(flags['no-defaults']);
        const isDryRun = Boolean(flags['dry-run']);
        const batchSize = parseInt(flags['batch-size'] ?? String(BATCH_SIZE), 10) || BATCH_SIZE;
        const rawTags = flags.tag;
        const tags = Array.isArray(rawTags) ? rawTags : (rawTags ? [rawTags] : []);
        const features = ['data/abstraction/file', ...tagsToFeatures(tags)];

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

        if (files.length === 0) { io.warn('No files to upload'); return; }

        if (isDryRun) {
            files.slice(0, 30).forEach(f => io.print(f));
            if (files.length > 30) io.print(`... and ${files.length - 30} more`);
            io.print(`\nTotal: ${files.length} file(s) — dry run, nothing uploaded`);
            return;
        }

        try { await handle.api.workspaces.start(handle.id); } catch { /* already started */ }

        const flush = async (docs) => {
            const primary = targets[0];
            const created = await handle.api.workspaces.insertDocuments(handle.id, {
                documents: docs,
                features,
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

        let uploaded = 0;
        let failed = 0;
        let batch = [];

        for (const fp of files) {
            try {
                const fstat = await statAsync(fp);
                // Stream bytes → content-addressed stored:// location (deduped +
                // hashed server-side; never buffers the file in memory here).
                const { url, checksum, size } = await handle.api.workspaces.uploadBlob(handle.id, createReadStream(fp));
                batch.push({
                    schema: 'data/abstraction/file',
                    schemaVersion: '3.0',
                    checksumArray: checksum ? [`sha256:${checksum}`] : [],
                    locations: [{ url }],
                    metadata: {
                        contentType: guessMime(fp),
                        size: size ?? fstat.size,
                        filename: basename(fp),
                        mtime: fstat.mtime.toISOString(),
                    },
                    data: {},
                });
                if (batch.length >= batchSize) {
                    await flush(batch);
                    uploaded += batch.length;
                    batch = [];
                    io.print(`  ${uploaded}/${files.length} uploaded...`);
                }
            } catch (e) {
                failed++;
                io.warn(`  skip ${fp}: ${e.message}`);
            }
        }

        if (batch.length > 0) {
            await flush(batch);
            uploaded += batch.length;
        }

        const targetDesc = targets.map(t => `${t.treeNameOrTreeId || t.treeType || 'context'}:${t.context}`).join(', ');
        io.success(
            `Uploaded ${uploaded} file(s) into ${handle.id} [${targetDesc}]` +
            (failed ? `  (${failed} skipped)` : ''),
        );
    },
};

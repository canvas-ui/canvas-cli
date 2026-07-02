'use strict';

import { stat, createReadStream } from 'node:fs';
import { resolve, basename } from 'node:path';
import { promisify } from 'node:util';
import { walkFiles, ingestFile, guessMime, fsMeta, readXattrs } from './ingest.js';
import { parseTargets, targetBody } from './docbuilders.js';
import device from '../../dot/lib/device.js';
import { UsageError } from '../../../core/errors.js';

const statAsync = promisify(stat);
const BATCH_SIZE = 50;

/**
 * Shared file ingestion for the `add`(=upload) / `upload` / `index` verbs, over a
 * workspace OR context handle (via `adapter`).
 *
 *   mode 'upload' → stream bytes to the server blob store → stored:// location
 *                   (server-resident, embeddable, EXIF/etc extracted server-side).
 *   mode 'index'  → index in place → file://<deviceId> pointer (bytes stay on the
 *                   device, NOT server-resident, not embeddable).
 *
 * adapter: {
 *   label,                                 // for the summary line
 *   start(): Promise,                      // best-effort ensure target is running
 *   insertDocuments(body): Promise,        // POST documents/documentIds
 *   uploadBlob(streamOrBuffer): Promise,   // upload path only
 * }
 */
export async function ingestPath(ctx, { mode, adapter }) {
    const { args, flags, io } = ctx;
    const srcRaw = args.source ?? args.type;
    if (!srcRaw) { throw new UsageError('Path required (e.g. /path/to/file-or-dir)'); }

    const targets = parseTargets(flags);
    const absPath = resolve(srcRaw);
    const extraExclude = flags.exclude
        ? String(flags.exclude).split(',').map(s => s.trim()).filter(Boolean)
        : [];
    const noDefaults = Boolean(flags['no-defaults']);
    const isDryRun = Boolean(flags['dry-run']);
    const batchSize = parseInt(flags['batch-size'] ?? String(BATCH_SIZE), 10) || BATCH_SIZE;
    const contentTimeline = flags.timeline || 'content';
    const verb = mode === 'upload' ? 'uploaded' : 'indexed';

    let pathStat;
    try { pathStat = await statAsync(absPath); }
    catch { throw new UsageError(`Path not found: ${absPath}`); }
    if (!pathStat.isFile() && !pathStat.isDirectory()) {
        throw new UsageError('Path must be a regular file or directory');
    }

    const files = [];
    if (pathStat.isDirectory()) {
        io.info(`Scanning ${absPath} ...`);
        for await (const fp of walkFiles(absPath, { exclude: extraExclude, noDefaults })) { files.push(fp); }
        io.info(`Found ${files.length} file(s)`);
    } else {
        files.push(absPath);
    }
    if (files.length === 0) { io.warn('No files to process'); return; }

    if (isDryRun) {
        files.slice(0, 30).forEach(f => io.print(f));
        if (files.length > 30) { io.print(`... and ${files.length - 30} more`); }
        io.print(`\nTotal: ${files.length} file(s) — dry run, nothing sent`);
        return;
    }

    if (mode === 'upload') { try { await adapter.start(); } catch { /* already started */ } }

    const flush = async (docs) => {
        const primary = targets[0];
        const created = await adapter.insertDocuments({ documents: docs, features: ['data/abstraction/file'], ...targetBody(primary) });
        const ids = (Array.isArray(created) ? created : created?.documents || []).map(d => d.id).filter(Boolean);
        for (const target of targets.slice(1)) {
            await adapter.insertDocuments({ documentIds: ids, ...targetBody(target) });
        }
    };

    const buildUpload = async (fp) => {
        const fstat = await statAsync(fp);
        const up = await adapter.uploadBlob(createReadStream(fp));
        const xattrs = await readXattrs(fp);
        const fs = fsMeta(fstat);
        const capturedAt = up.metadata?.exif?.capturedAt;
        const doc = {
            schema: 'data/abstraction/file',
            schemaVersion: '3.0',
            checksumArray: up.checksum ? [`sha256/${up.checksum}`] : [],
            locations: [{ url: up.url }],
            metadata: {
                contentType: guessMime(fp),
                size: up.size ?? fstat.size,
                filename: basename(fp),
                mtime: fstat.mtime.toISOString(),
                ...(Object.keys(fs).length ? { fs } : {}),
                ...(Object.keys(xattrs).length ? { xattrs } : {}),
                ...(up.metadata || {}),
            },
            data: {},
        };
        if (capturedAt) { doc.timelines = [{ timeline: contentTimeline, start: capturedAt }]; }
        return doc;
    };

    let done = 0;
    let failed = 0;
    let batch = [];
    for (const fp of files) {
        try {
            const doc = mode === 'upload' ? await buildUpload(fp) : await ingestFile(fp, device.id);
            batch.push(doc);
            if (batch.length >= batchSize) {
                await flush(batch);
                done += batch.length;
                batch = [];
                io.print(`  ${done}/${files.length} ${verb}...`);
            }
        } catch (e) {
            failed++;
            io.warn(`  skip ${fp}: ${e.message}`);
        }
    }
    if (batch.length > 0) { await flush(batch); done += batch.length; }

    const targetDesc = targets.map(t => `${t.treeNameOrTreeId || t.treeType || 'context'}:${t.context}`).join(', ');
    io.success(
        `${mode === 'upload' ? 'Uploaded' : 'Indexed'} ${done} file(s) into ${adapter.label} [${targetDesc}]` +
        (failed ? `  (${failed} skipped)` : ''),
    );
}

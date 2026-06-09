'use strict';

import { stat } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { resolveWorkspaceHandle } from '../lib/handle.js';
import { walkFiles, ingestFile } from '../lib/ingest.js';
import device from '../../dot/lib/device.js';
import { UsageError } from '../../../core/errors.js';

const statAsync = promisify(stat);
const BATCH_SIZE = 50;

// ─── Flags ────────────────────────────────────────────────────────────────────
//
// -c / --context   workspace tree context path(s) to add under (repeatable)
//                  default: /
// --dir            directory-tree path (uses treeType:'directory' instead of context)
// --exclude        extra dir/file names to exclude, comma-separated
// --no-defaults    skip default exclusion list
// --dry-run        scan only, print paths, no network calls
// --batch-size     docs per POST batch (default 50)
//
// Note: -d is overridden here to mean --dir, not the global --debug alias.

export default {
    name: 'add',
    description: 'Index local file or directory into a workspace',
    positional: [{ name: 'path', required: true }],
    flags: {
        dir: 'string',
        exclude: 'string',
        'no-defaults': 'boolean',
        'dry-run': 'boolean',
        'batch-size': 'string',
    },
    flagAliases: { d: 'dir' },
    needsConnection: false,

    async run(ctx) {
        const { args, flags, io } = ctx;
        if (!args.path) throw new UsageError('Path required (file or directory)');

        const handle = resolveWorkspaceHandle(ctx);
        const absPath = resolve(args.path);
        const deviceId = device.id;

        // Collect context paths (-c / --context, may be repeated → array)
        const rawCtx = flags.context;
        const contextPaths = rawCtx
            ? (Array.isArray(rawCtx) ? rawCtx : [rawCtx])
            : [];

        // Directory-tree path (--dir)
        const dirPath = flags.dir || null;

        // Extra exclusions (comma-separated)
        const extraExclude = flags.exclude
            ? String(flags.exclude).split(',').map(s => s.trim()).filter(Boolean)
            : [];

        const noDefaults = Boolean(flags['no-defaults']);
        const isDryRun = Boolean(flags['dry-run']);
        const batchSize = parseInt(flags['batch-size'] || String(BATCH_SIZE), 10) || BATCH_SIZE;

        // ── Resolve path ──────────────────────────────────────────────────────
        let pathStat;
        try { pathStat = await statAsync(absPath); }
        catch { throw new UsageError(`Path not found: ${absPath}`); }

        if (!pathStat.isFile() && !pathStat.isDirectory()) {
            throw new UsageError('Path must be a regular file or directory');
        }

        // ── Collect files ─────────────────────────────────────────────────────
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

        if (files.length === 0) {
            io.warn('No files to index');
            return;
        }

        if (isDryRun) {
            const preview = files.slice(0, 30);
            preview.forEach(f => io.print(f));
            if (files.length > 30) io.print(`... and ${files.length - 30} more`);
            io.print(`\nTotal: ${files.length} file(s) — dry run, nothing sent`);
            return;
        }

        // ── Ensure workspace is started ───────────────────────────────────────
        try { await handle.api.workspaces.start(handle.id); }
        catch { /* already started or non-fatal */ }

        // ── Build targets list ────────────────────────────────────────────────
        // Each target = { context?, treeType? } for one POST call per batch per target.
        // Targets derived from -c and --dir flags:
        //   no flags       → root context tree
        //   -c /foo        → context tree at /foo
        //   -c /foo -c /bar→ two context targets
        //   --dir /foo     → directory tree at /foo
        const targets = [];
        if (contextPaths.length > 0) {
            for (const cp of contextPaths) {
                targets.push({ context: cp, treeType: 'context' });
            }
        }
        if (dirPath) {
            targets.push({ context: dirPath, treeType: 'directory' });
        }
        if (targets.length === 0) {
            targets.push({ context: '/', treeType: 'context' });
        }

        // ── Hash + index ──────────────────────────────────────────────────────
        let indexed = 0;
        let failed = 0;
        let batch = [];

        const flush = async (docs) => {
            if (docs.length === 0) return [];

            // First target: create documents
            const primaryTarget = targets[0];
            const body = {
                documents: docs,
                features: ['data/abstraction/file'],
                context: primaryTarget.context,
                treeType: primaryTarget.treeType,
            };
            const created = await handle.api.workspaces.insertDocuments(handle.id, body);

            // Additional targets: link by ID (no re-hash)
            const ids = (Array.isArray(created) ? created : created?.documents || [])
                .map(d => d.id).filter(Boolean);

            if (ids.length > 0) {
                for (const target of targets.slice(1)) {
                    await handle.api.workspaces.insertDocuments(handle.id, {
                        documentIds: ids,
                        context: target.context,
                        treeType: target.treeType,
                    });
                }
            }

            return ids;
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

        // Flush remainder
        if (batch.length > 0) {
            await flush(batch);
            indexed += batch.length;
        }

        const targetDesc = targets.map(t => `${t.treeType}:${t.context}`).join(', ');
        io.success(
            `Indexed ${indexed} file(s) into ${handle.id} [${targetDesc}]` +
            (failed ? `  (${failed} skipped)` : ''),
        );
    },
};

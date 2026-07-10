'use strict';

import { UsageError } from '../../../../core/errors.js';
import { resolveHandle } from '../lib/handle.js';

export default {
    name: 'explain',
    description: 'Show which rules/hooks would fire for a document and why',
    positional: [{ name: 'documentId', required: true }],
    flags: {
        event: 'string', // event to simulate (default document.inserted)
        paths: 'string', // comma-separated landing paths to simulate for path matchers
    },
    async run(ctx) {
        const handle = resolveHandle(ctx);
        const docId = Number(ctx.args.documentId);
        if (!Number.isInteger(docId)) {
            throw new UsageError('Usage: canvas ws <name> hooks explain <documentId> [--event <name>] [--paths /a,/b]');
        }

        const body = { documentId: docId };
        if (ctx.flags.event) { body.event = ctx.flags.event; }
        if (ctx.flags.paths) { body.paths = ctx.flags.paths.split(',').map((p) => p.trim()).filter(Boolean); }

        const result = await handle.api.workspaces.hooks.explain(handle.id, body);
        ctx.io.info(`Document ${result.documentId} (${result.schema}) · event ${result.event}${result.paths?.length ? ` · paths ${result.paths.join(', ')}` : ''}`);

        if (!result.rules?.length && !result.hooks?.length) {
            ctx.io.warn('No rules or hooks for this event');
            return;
        }

        for (const rule of result.rules || []) {
            const head = `${rule.matched ? '✔' : '✘'} rule ${rule.id}${rule.enabled ? '' : ' (disabled)'}${rule.cascade ? ' (cascade)' : ''}`;
            ctx.io.info(head);
            for (const chk of rule.checks || []) {
                ctx.io.info(`    ${chk.matched ? '✔' : '✘'} ${chk.key}${chk.unknown ? ' (unknown matcher)' : ''}: ${JSON.stringify(chk.expected)}`);
            }
        }
        for (const hook of result.hooks || []) {
            ctx.io.info(`● hook ${hook.path} — ${hook.note}`);
        }
    },
};

'use strict';

import { parseWithSchema, bindPositional } from './parser.js';
import { UsageError } from './errors.js';

export async function dispatch({ tokens, argv, registry, ctx }) {
    if (tokens.length === 0) return { kind: 'help' };

    const head = tokens[0];
    const mod = registry.byName.get(head);
    if (!mod) throw new UsageError(`Unknown command: ${head}`);

    const isPlural = mod.pluralAlias === head;
    return await walk({
        mod,
        remaining: tokens.slice(1),
        argv: argv || tokens,
        ctx,
        parent: {},
        isPlural,
    });
}

async function walk({ mod, remaining, argv, ctx, parent, isPlural }) {
    let tokens = remaining;

    if (mod.resourceArg && tokens.length > 0) {
        const next = tokens[0];
        const knownAction = mod.actions.has(next);
        const knownSub = mod.submodules.has(next);
        if (!knownAction && !knownSub) {
            const resolver = mod.resourceArg.resolve;
            const handle = resolver
                ? await resolver(next, ctx)
                : { id: next, raw: next };
            // resolver may return null/undefined to mean "don't consume this token"
            if (handle) {
                parent[mod.resourceArg.name || mod.name] = handle;
                tokens = tokens.slice(1);
            }
        }
    }

    if (tokens.length > 0 && mod.submodules.has(tokens[0])) {
        const sub = mod.submodules.get(tokens[0]);
        return walk({
            mod: sub,
            remaining: tokens.slice(1),
            argv,
            ctx,
            parent,
            isPlural: false,
        });
    }

    // Resource resolved but no action token → show module help.
    const resourceWasConsumed = mod.resourceArg && parent[mod.resourceArg.name || mod.name];
    if (resourceWasConsumed && tokens.length === 0) {
        return { kind: 'help', module: mod.name };
    }

    const defaultAction = isPlural && mod.defaultPluralAction
        ? mod.defaultPluralAction
        : (mod.defaultAction || 'help');
    const actionName = tokens[0] && mod.actions.has(tokens[0]) ? tokens[0] : defaultAction;
    const actionTokens = tokens[0] && mod.actions.has(tokens[0]) ? tokens.slice(1) : tokens;

    const action = mod.actions.get(actionName);
    if (!action) {
        throw new UsageError(`Unknown action '${actionName}' for module '${mod.name}'`);
    }

    return invoke({ mod, action, actionTokens, argv, ctx, parent });
}

async function invoke({ mod, action, actionTokens, argv, ctx, parent }) {
    // Re-parse the FULL argv with the action's flag schema so flags placed
    // anywhere on the line are picked up (the global first-pass parser
    // doesn't know about action-specific flags).
    const fullParsed = parseWithSchema(argv, action);
    // Positional tokens from action-local slice (after action name).
    const localParsed = parseWithSchema(actionTokens, action);
    const positional = action.positional || [];
    const { args: posArgs, rest } = bindPositional(localParsed._, positional);
    const parsed = fullParsed;

    const flags = { ...parsed };
    delete flags._;

    const needsConnection = action.needsConnection ?? mod.needsConnection ?? false;
    if (needsConnection && ctx.client && typeof ctx.client.ping === 'function') {
        await ctx.client.ping();
    }

    return action.run({
        client: ctx.client,
        session: ctx.session,
        io: ctx.io,
        args: posArgs,
        rest,
        flags,
        parent,
        stdin: ctx.stdin,
        module: mod,
    });
}

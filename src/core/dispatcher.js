'use strict';

import { parseWithSchema, bindPositional, missingPositionals, formatUsage } from './parser.js';
import { UsageError } from './errors.js';

/**
 * One grammar, at every level:
 *
 *   canvas <module> [<resource>] [<noun>] [<verb>] [<term>…] [--flags]
 *
 * Nouns are submodules, verbs are actions, and the walk below is the same
 * whether it is standing on a module or three levels down.
 */
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
        path: [head],
    });
}

// A bare token in the resource slot could be an address or a noun. R3 settles
// it: an address wins (it is unambiguous), then a noun, then everything else
// is a resource. So `ctx note list` is the note noun, while a context actually
// named `note` stays reachable as `ctx user@remote:note`.
function looksLikeAddress(token) {
    return token.includes('@') || token.includes(':');
}

async function walk({ mod, remaining, argv, ctx, parent, isPlural, path }) {
    let tokens = remaining;

    if (mod.resourceArg && tokens.length > 0) {
        const next = tokens[0];
        const knownAction = mod.actions.has(next);
        const knownSub = mod.submodules.has(next);
        if (!knownAction && (!knownSub || looksLikeAddress(next))) {
            const resolver = mod.resourceArg.resolve;
            const handle = resolver
                ? await resolver(next, ctx)
                : { id: next, raw: next };
            // resolver may return null/undefined to mean "don't consume this token"
            if (handle) {
                const key = mod.resourceArg.name || mod.name;
                if (parent[key]) {
                    throw new UsageError(`Ambiguous ${key}: '${next}' — one is already addressed`);
                }
                parent[key] = handle;
                tokens = tokens.slice(1);
            }
        }
    }

    if (tokens.length > 0 && mod.submodules.has(tokens[0])) {
        const token = tokens[0];
        const sub = mod.submodules.get(token);
        return walk({
            mod: sub,
            remaining: tokens.slice(1),
            argv,
            ctx,
            parent,
            // R2: plural is list, at any depth. This used to be hardcoded
            // false, which is why `<noun>s` only worked for top-level modules.
            isPlural: mod.submodulePlurals?.has(token) || sub.pluralAlias === token,
            path: [...path, token],
        });
    }

    const resourceWasConsumed = mod.resourceArg && parent[mod.resourceArg.name || mod.name];
    // A bare resource runs the module's own default for a named resource
    // (`ws universe` → `ws universe show`). Printing generic module help was a
    // strictly worse answer to a strictly more specific question.
    const usesResourceDefault = resourceWasConsumed && !isPlural
        && !(tokens[0] && mod.actions.has(tokens[0]))
        && Boolean(mod.defaultResourceAction);
    const defaultAction = isPlural && mod.defaultPluralAction
        ? mod.defaultPluralAction
        : (usesResourceDefault ? mod.defaultResourceAction : mod.defaultAction) || 'help';

    if (resourceWasConsumed && tokens.length === 0 && !mod.defaultResourceAction && !isPlural) {
        return { kind: 'help', path };
    }

    // `ws <name> <junk>` can only ever be a noun or a verb — never free text —
    // so a leftover token here is a typo, not an argument. Falling through to
    // the default action would answer a question nobody asked.
    if (usesResourceDefault && tokens.length > 0) {
        throw new UsageError(
            `Unknown noun or verb '${tokens[0]}' for ${mod.name}. ` +
            `Try \`canvas ${path.join(' ')} --help\`.`,
        );
    }

    const hasActionToken = tokens[0] && mod.actions.has(tokens[0]);
    const actionName = hasActionToken ? tokens[0] : defaultAction;
    const actionTokens = hasActionToken ? tokens.slice(1) : tokens;
    const actionPath = hasActionToken ? [...path, tokens[0]] : [...path, actionName];

    const action = mod.actions.get(actionName);
    if (!action) {
        throw new UsageError(`Unknown action '${actionName}' for module '${mod.name}'`);
    }

    return invoke({ mod, action, actionTokens, argv, ctx, parent, path: actionPath });
}

async function invoke({ mod, action, actionTokens, argv, ctx, parent, path }) {
    // Re-parse the FULL argv with the action's flag schema so flags placed
    // anywhere on the line are picked up with their real types.
    const fullParsed = parseWithSchema(argv, action);
    // Positional tokens from action-local slice (after action name).
    const localParsed = parseWithSchema(actionTokens, action);
    const positional = action.positional || [];
    const { args: posArgs, rest } = bindPositional(localParsed._, positional);
    const parsed = fullParsed;

    const flags = { ...parsed };
    delete flags._;

    const missing = missingPositionals(posArgs, positional);
    if (missing.length) {
        throw new UsageError(
            `Missing required argument${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}\n` +
            `Usage: ${formatUsage(path, action)}`,
        );
    }

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
        path,
    });
}

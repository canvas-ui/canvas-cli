'use strict';

import * as moduleExports from '../modules/index.js';

export function loadRegistry() {
    const modules = Object.values(moduleExports)
        .filter((m) => m && m.name)
        .map(processModule);
    const byName = indexModules(modules);
    return { byName, modules };
}

// One name must mean one thing at one level. Actions and submodules share the
// grammar slot right after a module, so a name registered as both makes the
// action unreachable — silently, before this check existed. Nouns arrive as
// submodules, which multiplies the chances of a clash, so this throws at load:
// every command run pays for it, which is exactly when you want to find out.
function claim(map, key, value, kind, modName) {
    const prior = map.get(key);
    if (prior && prior !== value) {
        throw new Error(
            `CLI registry: '${key}' is registered twice in '${modName}' ` +
            `(${kind}) — names must be unique per module`,
        );
    }
    map.set(key, value);
}

function processModule(mod) {
    const actions = new Map();
    for (const a of mod.actions || []) {
        if (!a?.name) continue;
        claim(actions, a.name, a, 'action', mod.name);
        for (const alias of a.aliases || []) claim(actions, alias, a, 'action alias', mod.name);
    }

    const submodules = new Map();
    // Plural keys of submodules, so the dispatcher can tell `note` (the noun)
    // from `notes` (the noun's list) without re-deriving the plural.
    const plurals = new Set();
    for (const sub of mod.submodules || []) {
        const processed = processModule(sub);
        claim(submodules, processed.name, processed, 'submodule', mod.name);
        for (const alias of processed.aliases || []) {
            claim(submodules, alias, processed, 'submodule alias', mod.name);
        }
        if (processed.pluralAlias) {
            claim(submodules, processed.pluralAlias, processed, 'submodule plural', mod.name);
            plurals.add(processed.pluralAlias);
        }
        for (const plural of processed.aliasPlurals || []) {
            claim(submodules, plural, processed, 'submodule alias plural', mod.name);
            plurals.add(plural);
        }
    }

    // A verb and a noun cannot share a name either: the dispatcher checks
    // submodules first, so the action would never run.
    for (const key of submodules.keys()) {
        if (actions.has(key)) {
            throw new Error(
                `CLI registry: '${key}' is both an action and a submodule of '${mod.name}'`,
            );
        }
    }

    return { ...mod, actions, submodules, submodulePlurals: plurals };
}

function indexModules(modules) {
    const byName = new Map();
    for (const mod of modules) {
        byName.set(mod.name, mod);
        for (const alias of mod.aliases || []) byName.set(alias, mod);
        if (mod.pluralAlias) byName.set(mod.pluralAlias, mod);
    }
    return byName;
}

/**
 * Every flag name any action declares, so the global pre-pass can tokenize a
 * command line without swallowing positionals. Without this,
 * `ctx note add --dry-run foo` loses `foo`: minimist has never heard of
 * `dry-run`, assumes it takes a value, and eats the next token.
 *
 * Type conflicts resolve to boolean on purpose. Two actions declare `watch`
 * with different types (workspace/backends add vs update); a wrong boolean
 * leaves a stray token in `rest`, a wrong string eats a real one. The typed
 * value is re-parsed per action in `dispatcher.invoke` anyway.
 *
 * @returns {{string: string[], boolean: string[], alias: Object}}
 */
export function collectFlagVocabulary(registry) {
    const strings = new Set();
    const booleans = new Set();
    const alias = {};

    const visit = (mod) => {
        const seenAction = new Set();
        for (const action of mod.actions.values()) {
            if (seenAction.has(action)) continue;
            seenAction.add(action);
            for (const [name, type] of Object.entries(action.flags || {})) {
                if (type === 'boolean') booleans.add(name);
                else strings.add(name);
            }
            Object.assign(alias, action.flagAliases || {});
        }
        const seenSub = new Set();
        for (const sub of mod.submodules.values()) {
            if (seenSub.has(sub)) continue;
            seenSub.add(sub);
            visit(sub);
        }
    };
    for (const mod of registry.modules) visit(mod);

    for (const name of booleans) strings.delete(name);
    return { string: [...strings], boolean: [...booleans], alias };
}

/**
 * Follow a token path as far as the registry understands it, resolving
 * nothing and calling no network — the read-only twin of the dispatcher's
 * walk, used to render help for any level (`canvas ws note add --help`).
 *
 * Tokens that match neither a submodule nor an action are skipped: those are
 * resource addresses and positionals, which help doesn't care about.
 *
 * @returns {{path: string[], mod: Object|null, action: Object|null}}
 */
export function resolvePath(registry, tokens = []) {
    const path = [];
    let mod = registry.byName.get(tokens[0]);
    if (!mod) return { path, mod: null, action: null };
    path.push(tokens[0]);

    for (const token of tokens.slice(1)) {
        const sub = mod.submodules.get(token);
        if (sub) {
            mod = sub;
            path.push(token);
            continue;
        }
        const action = mod.actions.get(token);
        if (action) {
            path.push(token);
            return { path, mod, action };
        }
        // resource address or positional — keep looking at the same level
    }
    return { path, mod, action: null };
}

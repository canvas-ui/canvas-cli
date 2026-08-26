'use strict';

import minimist from 'minimist';

const GLOBAL_STRINGS = ['remote', 'context', 'workspace', 'format', 'title', 'tag',
    'schema', 'template', 'priority', 'label', 'description', 'color', 'metadata'];
const GLOBAL_BOOLEANS = ['help', 'version', 'raw', 'verbose', 'debug', 'quiet', 'force', 'json'];
const GLOBAL_ALIASES = {
    h: 'help', v: 'version', c: 'context', w: 'workspace',
    f: 'format', r: 'raw', d: 'debug', q: 'quiet', t: 'tag',
};

/**
 * First pass: produces the token stream the dispatcher walks.
 *
 * `vocab` comes from the registry (`collectFlagVocabulary`) so every flag any
 * action declares is known here. It matters because an unknown `--flag` is
 * assumed by minimist to take a value, which silently removes the next real
 * token from `_` — `ctx note add --dry-run foo` would lose `foo` and the
 * dispatcher would never see the note body.
 *
 * @param {string[]} argv
 * @param {{string?: string[], boolean?: string[], alias?: Object}} [vocab]
 */
export function parseGlobal(argv, vocab = {}) {
    return minimist(argv, {
        string: [...GLOBAL_STRINGS, ...(vocab.string || [])],
        boolean: [...GLOBAL_BOOLEANS, ...(vocab.boolean || [])],
        alias: { ...GLOBAL_ALIASES, ...(vocab.alias || {}) },
        stopEarly: false,
    });
}

export function parseWithSchema(argv, actionSchema = {}) {
    const flags = actionSchema.flags || {};
    const string = [...GLOBAL_STRINGS];
    const boolean = [...GLOBAL_BOOLEANS];
    for (const [name, type] of Object.entries(flags)) {
        if (type === 'string') string.push(name);
        else if (type === 'boolean') boolean.push(name);
    }
    return minimist(argv, {
        string,
        boolean,
        alias: { ...GLOBAL_ALIASES, ...(actionSchema.flagAliases || {}) },
    });
}

export function bindPositional(tokens, positional = []) {
    const args = {};
    let rest = [];
    for (let i = 0; i < positional.length; i++) {
        const spec = positional[i];
        if (spec.variadic) {
            args[spec.name] = tokens.slice(i);
            rest = [];
            return { args, rest };
        }
        args[spec.name] = tokens[i];
    }
    rest = tokens.slice(positional.length);
    return { args, rest };
}

/**
 * Required positionals that were not supplied. `required: true` has been
 * declared on ~40 actions and enforced by none of them — each hand-threw its
 * own message, or forgot to.
 *
 * @param {Object} args bound positionals
 * @param {Object[]} positional the action's schema
 * @returns {string[]} names of missing required positionals
 */
export function missingPositionals(args, positional = [], { resourceConsumed = false } = {}) {
    const missing = [];
    for (const spec of positional) {
        if (!spec?.required) continue;
        // `remote <id> show` puts the id in the resource slot, so the `id`
        // positional is satisfied even though nothing followed the verb.
        if (spec.fromResource && resourceConsumed) continue;
        const value = args[spec.name];
        const empty = spec.variadic
            ? !Array.isArray(value) || value.length === 0
            : value === undefined || value === null || value === '';
        if (empty) missing.push(spec.name);
    }
    return missing;
}

/**
 * The one usage renderer, shared by `--help` and by the missing-argument
 * error, so the two can never describe a command differently.
 *
 *   formatUsage(['ctx', 'note', 'add'], addAction)
 *   → 'canvas ctx note add <body…> [--title <v>] [--tag <v>]'
 *
 * @param {string[]} path grammar tokens leading to the action
 * @param {Object} action
 */
export function formatUsage(path = [], action = {}) {
    const parts = ['canvas', ...path];
    for (const spec of action.positional || []) {
        const name = spec.variadic ? `${spec.name}…` : spec.name;
        parts.push(spec.required ? `<${name}>` : `[${name}]`);
    }
    for (const [name, type] of Object.entries(action.flags || {})) {
        parts.push(type === 'boolean' ? `[--${name}]` : `[--${name} <v>]`);
    }
    return parts.join(' ');
}

'use strict';

import minimist from 'minimist';

const GLOBAL_STRINGS = ['remote', 'context', 'workspace', 'format', 'title', 'tag',
    'schema', 'template', 'priority', 'label', 'description', 'color', 'metadata'];
const GLOBAL_BOOLEANS = ['help', 'version', 'raw', 'verbose', 'debug', 'quiet', 'force', 'json'];
const GLOBAL_ALIASES = {
    h: 'help', v: 'version', c: 'context', w: 'workspace',
    f: 'format', r: 'raw', d: 'debug', q: 'quiet', t: 'tag',
};

export function parseGlobal(argv) {
    return minimist(argv, {
        string: GLOBAL_STRINGS,
        boolean: GLOBAL_BOOLEANS,
        alias: GLOBAL_ALIASES,
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

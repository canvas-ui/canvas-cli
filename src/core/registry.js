'use strict';

import * as moduleExports from '../modules/index.js';

export function loadRegistry() {
    const modules = Object.values(moduleExports)
        .filter((m) => m && m.name)
        .map(processModule);
    const byName = indexModules(modules);
    return { byName, modules };
}

function processModule(mod) {
    const actions = new Map();
    for (const a of mod.actions || []) {
        if (!a?.name) continue;
        actions.set(a.name, a);
        for (const alias of a.aliases || []) actions.set(alias, a);
    }
    const submodules = new Map();
    for (const sub of mod.submodules || []) {
        const processed = processModule(sub);
        submodules.set(processed.name, processed);
        for (const alias of processed.aliases || []) submodules.set(alias, processed);
    }
    return { ...mod, actions, submodules };
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

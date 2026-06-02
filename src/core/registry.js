'use strict';

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULES_ROOT = join(HERE, '..', 'modules');

export async function loadRegistry(root = MODULES_ROOT) {
    if (!existsSync(root)) return { byName: new Map(), modules: [] };
    const modules = [];
    for (const entry of readdirSync(root)) {
        const dir = join(root, entry);
        if (!statSync(dir).isDirectory()) continue;
        const mod = await loadModule(dir);
        if (mod) modules.push(mod);
    }
    const byName = indexModules(modules);
    return { byName, modules };
}

async function loadModule(dir) {
    const indexPath = join(dir, 'index.js');
    if (!existsSync(indexPath)) return null;
    const mod = (await import(pathToFileURL(indexPath).href)).default;
    if (!mod || !mod.name) return null;

    mod.actions = await loadActions(join(dir, 'actions'));
    mod.submodules = await loadSubmodules(dir, mod);
    mod._dir = dir;
    if (mod.resourceArg && typeof mod.resourceArg.resolver === 'string') {
        const resolverPath = join(dir, mod.resourceArg.resolver);
        if (existsSync(resolverPath)) {
            mod.resourceArg.resolve = (await import(pathToFileURL(resolverPath).href)).default;
        }
    }
    return mod;
}

async function loadActions(dir) {
    const map = new Map();
    if (!existsSync(dir)) return map;
    for (const file of readdirSync(dir)) {
        if (!file.endsWith('.js')) continue;
        const path = join(dir, file);
        const action = (await import(pathToFileURL(path).href)).default;
        if (!action || !action.name) continue;
        map.set(action.name, action);
        for (const alias of action.aliases || []) map.set(alias, action);
    }
    return map;
}

async function loadSubmodules(dir, parent) {
    const submap = new Map();
    const whitelist = Array.isArray(parent.submodules) ? new Set(parent.submodules) : null;
    for (const entry of readdirSync(dir)) {
        if (entry === 'actions' || entry === 'lib' || entry.startsWith('.')) continue;
        const sub = join(dir, entry);
        if (!statSync(sub).isDirectory()) continue;
        if (!existsSync(join(sub, 'index.js'))) continue;
        if (whitelist && !whitelist.has(entry)) continue;
        const child = await loadModule(sub);
        if (child) {
            submap.set(child.name, child);
            for (const alias of child.aliases || []) submap.set(alias, child);
        }
    }
    return submap;
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

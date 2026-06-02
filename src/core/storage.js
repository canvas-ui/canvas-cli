'use strict';

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
    DIR_CONFIG, DIR_DB, DIR_DATA, DIR_CACHE, DIR_VAR,
    FILE_REMOTES, FILE_SESSION, FILE_ALIASES, FILE_CONFIG,
    FILE_CONTEXTS, FILE_WORKSPACES, FILE_AGENTS, FILE_DOTFILES,
} from './paths.js';

function ensureDirs() {
    for (const d of [DIR_CONFIG, DIR_DB, DIR_DATA, DIR_CACHE, DIR_VAR]) {
        if (!existsSync(d)) mkdirSync(d, { recursive: true });
    }
}
ensureDirs();

class JsonFile {
    constructor(path, defaults = {}) {
        this.path = path;
        this.defaults = defaults;
        if (!existsSync(path)) this.write(defaults);
    }

    read() {
        try { return JSON.parse(readFileSync(this.path, 'utf8')); }
        catch { return { ...this.defaults }; }
    }

    write(data) {
        mkdirSync(dirname(this.path), { recursive: true });
        writeFileSync(this.path, JSON.stringify(data, null, 2), { mode: 0o600 });
    }

    get(key) { return this.read()[key]; }

    set(key, value) {
        const data = this.read();
        data[key] = value;
        this.write(data);
    }

    delete(key) {
        const data = this.read();
        delete data[key];
        this.write(data);
    }

    has(key) {
        return Object.prototype.hasOwnProperty.call(this.read(), key);
    }

    keys() { return Object.keys(this.read()); }

    entries() { return Object.entries(this.read()); }

    clear() { this.write({ ...this.defaults }); }
}

export const remotes = new JsonFile(FILE_REMOTES, {});
export const session = new JsonFile(FILE_SESSION, {
    boundRemote: null,
    boundRemoteStatus: 'disconnected',
    boundContext: null,
    boundContextId: null,
    boundContextUrl: null,
    boundAt: null,
});
export const aliases = new JsonFile(FILE_ALIASES, {});
export const config = new JsonFile(FILE_CONFIG, {});
export const contexts = new JsonFile(FILE_CONTEXTS, {});
export const workspaces = new JsonFile(FILE_WORKSPACES, {});
export const agents = new JsonFile(FILE_AGENTS, {});
export const dotfiles = new JsonFile(FILE_DOTFILES, {});

export function resolveAlias(token) {
    const a = aliases.get(token);
    return a?.address || token;
}

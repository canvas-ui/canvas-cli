'use strict';

import os from 'node:os';
import path from 'node:path';
import { DIR_CONFIG } from '../../../core/paths.js';
import { JsonFile } from '../../../core/storage.js';

/*
 * Device mirrors — which workspaces this machine keeps in sync as real folders
 * under a mirror root (default ~/Workspaces/<workspace>), via
 * `canvas-fuse mount --mirror`. This file is the CLI's own bookkeeping; the
 * mount itself (cache, ledger, queue) lives in canvas-fuse's data dir, and the
 * hub keeps the device's status report. Keep it small and human-editable.
 */

export const FILE_MIRRORS = path.join(DIR_CONFIG, 'mirrors.json');
export const DEFAULTS = Object.freeze({ version: 1, root: null, mirrors: [] });
export const CONFLICT_MODES = ['prompt', 'rename'];
export const DELETE_MODES = ['propagate', 'keep'];
// fuse = canvas-fuse --mirror (Linux, on-demand + pins); daemon = canvas-edge real folder.
export const CLIENTS = ['fuse', 'daemon'];

const store = new JsonFile(FILE_MIRRORS, { ...DEFAULTS, mirrors: [] });

export function defaultRoot() {
    return process.env.CANVAS_MIRROR_ROOT || path.join(os.homedir(), 'Workspaces');
}

export function readConfig() {
    const data = store.read();
    return { ...DEFAULTS, ...data, mirrors: Array.isArray(data.mirrors) ? data.mirrors : [] };
}

export function writeConfig(data) {
    store.write({ ...DEFAULTS, ...data, mirrors: Array.isArray(data.mirrors) ? data.mirrors : [] });
}

/** `<remote>/<workspace>` — unique per hub, readable in listings. */
export function mirrorId(remoteId, workspaceName) {
    return `${remoteId}/${workspaceName}`;
}

/** canvas-fuse mounts a `-w` workspace at `<root>/<folder>/` (the hub's folder name). */
export function mountpointFor(root, folderName) {
    return path.join(root, folderName);
}

export function splitList(value) {
    if (Array.isArray(value)) return value.flatMap(splitList);
    return String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * `name`, `name:sub/,other/` → { name, pins }. Pins are globs relative to the
 * workspace root; a bare folder means "that folder and everything below".
 */
export function parseWorkspaceSpec(spec) {
    const [name, pinsRaw = ''] = String(spec).split(':');
    const pins = splitList(pinsRaw).map((p) => (p.endsWith('/**') || p.includes('*') ? p : `${p.replace(/\/+$/, '')}/**`));
    return { name: name.trim(), pins };
}

/**
 * `folder` overrides the derived `<root>/<workspace>` location — that is how a
 * pre-existing folder (say ~/Code/UI) is published as a workspace and kept in
 * sync in place. Only the daemon client can do that: a FUSE mount needs an
 * empty mountpoint and would hide whatever the folder holds.
 */
export function buildMirror({ remoteId, workspaceId, workspaceName, folderName = null, root, folder = null, pins = [], ignore = [], conflicts = 'prompt', deletes = 'propagate', managed = 'manual', client = 'fuse' }) {
    if (!remoteId || !workspaceName) throw new Error('remoteId and workspaceName are required');
    if (!CONFLICT_MODES.includes(conflicts)) throw new Error(`conflicts must be one of ${CONFLICT_MODES.join('|')}`);
    if (!DELETE_MODES.includes(deletes)) throw new Error(`deletes must be one of ${DELETE_MODES.join('|')}`);
    if (!CLIENTS.includes(client)) throw new Error(`client must be one of ${CLIENTS.join('|')}`);
    if (folder && client !== 'daemon') throw new Error('a custom folder needs the daemon client (a FUSE mount must be an empty mountpoint)');
    const mirrorRoot = root || defaultRoot();
    return {
        id: mirrorId(remoteId, workspaceName),
        remote: remoteId,
        workspaceId: workspaceId || null,
        workspaceName,
        // The hub's case-preserving folder name ("Universe"); `workspaceName`
        // is the lowercase identity used in URLs and ids.
        folderName: folderName || workspaceName,
        root: mirrorRoot,
        mountpoint: folder ? path.resolve(folder) : mountpointFor(mirrorRoot, folderName || workspaceName),
        pins: [...new Set(pins)],
        ignore: [...new Set(ignore)],
        conflicts,
        deletes,
        client,
        // 'pm2' when `mirror service install` runs it, 'manual' when started detached.
        managed,
        paused: false,
        createdAt: new Date().toISOString(),
    };
}

export function listMirrors() {
    return readConfig().mirrors;
}

export function findMirror(ref) {
    if (!ref) return null;
    const needle = String(ref).trim();
    const mirrors = listMirrors();
    const lower = needle.toLowerCase();
    return mirrors.find((m) => m.id === needle)
        || mirrors.find((m) => m.id.toLowerCase() === lower)
        || mirrors.find((m) => m.workspaceName === lower || (m.folderName || '').toLowerCase() === lower)
        || mirrors.find((m) => m.workspaceId === needle)
        || mirrors.find((m) => m.mountpoint === path.resolve(needle))
        || null;
}

export function upsertMirror(entry) {
    const cfg = readConfig();
    const at = cfg.mirrors.findIndex((m) => m.id === entry.id);
    if (at >= 0) cfg.mirrors[at] = { ...cfg.mirrors[at], ...entry };
    else cfg.mirrors.push(entry);
    if (!cfg.root) cfg.root = entry.root;
    writeConfig(cfg);
    return at >= 0 ? cfg.mirrors[at] : entry;
}

export function removeMirror(id) {
    const cfg = readConfig();
    const before = cfg.mirrors.length;
    cfg.mirrors = cfg.mirrors.filter((m) => m.id !== id);
    writeConfig(cfg);
    return cfg.mirrors.length < before;
}

export function setRoot(root) {
    const cfg = readConfig();
    cfg.root = root;
    writeConfig(cfg);
}

/** minimist turns `--no-start` into `start: false`; accept both spellings. */
export function noStart(flags) {
    return !!(flags?.['no-start'] || flags?.start === false);
}

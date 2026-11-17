'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIR_CONFIG } from '../../../core/paths.js';
import { JsonFile } from '../../../core/storage.js';
import { UsageError } from '../../../core/errors.js';

/*
 * Shares this machine serves: local folders a workspace lists and reads in
 * place. The canvas-edge daemon reads this file (its share units); the CLI
 * writes it. Entry: { id, remote, workspaceName, name, label, mode, path, watch,
 * exclude, stateDir?, paused?, createdAt }.
 */
export const FILE_SHARES = path.join(DIR_CONFIG, 'shares.json');
const store = new JsonFile(FILE_SHARES, { version: 1, shares: [] });

export const SHARE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function readShares() {
    const data = store.read();
    return Array.isArray(data?.shares) ? data.shares : [];
}

function writeShares(shares) { store.write({ version: 1, shares }); }

/** `<remote>/<workspace>/<name>`: one share name per workspace per hub. */
export function shareId(remoteId, workspaceName, name) { return `${remoteId}/${workspaceName}/${name}`; }

export function findShare(remoteId, workspaceName, name) {
    return readShares().find((s) => s.id === shareId(remoteId, workspaceName, name)) || null;
}

export function upsertShare(share) {
    writeShares([...readShares().filter((s) => s.id !== share.id), share]);
    return share;
}

export function removeShare(id) {
    const shares = readShares();
    writeShares(shares.filter((s) => s.id !== id));
    return shares.some((s) => s.id === id);
}

export function assertShareName(name) {
    if (!SHARE_NAME.test(String(name || ''))) {
        throw new UsageError(`Share name must be <share>.<site> in lowercase letters, digits and dashes, e.g. --name nas-accounting.home (got "${name ?? ''}")`);
    }
    return name;
}

/** The folder as an absolute real path; it has to exist and be a directory. */
export function resolveFolder(folder) {
    const abs = path.resolve(String(folder).replace(/^~(?=$|\/)/, os.homedir()));
    let real;
    try { real = fs.realpathSync(abs); } catch { throw new UsageError(`Folder not found: ${abs}`); }
    if (!fs.statSync(real).isDirectory()) throw new UsageError(`Not a folder: ${real}`);
    return real;
}

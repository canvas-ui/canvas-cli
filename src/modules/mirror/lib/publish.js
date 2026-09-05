'use strict';

import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UsageError } from '../../../core/errors.js';
import { buildMirror, findMirror, listMirrors, upsertMirror } from './config.js';
import { createHubWorkspace, findHubWorkspace, hubWorkspaceName, listHubWorkspaces } from './hub.js';

/*
 * Publishing = "this folder becomes a workspace": create it on the hub (or
 * attach to an existing one of the same name), then mirror the folder in
 * place with the daemon client. The engine scans the folder first, so every
 * file that the hub does not know yet is pushed as new; nothing is moved.
 */

/** `~/Code/UI`, `~/Code/UI:ui` → { folder, name } (name defaults to the folder's basename). */
export function parsePublishSpec(spec) {
    const text = String(spec || '').trim();
    if (!text) throw new UsageError('Folder required');
    const at = text.lastIndexOf(':');
    // Windows drive letters ("C:\\x") also carry a colon; only split on a name-like tail.
    const tail = at > 0 ? text.slice(at + 1) : '';
    const hasName = at > 1 && tail && !tail.includes(path.sep) && !tail.includes('/');
    const folderRaw = hasName ? text.slice(0, at) : text;
    const folder = path.resolve(folderRaw.replace(/^~(?=$|[\\/])/, os.homedir()));
    const name = hubWorkspaceName(hasName ? tail : path.basename(folder));
    if (!name) throw new UsageError(`Cannot derive a workspace name from '${text}'`);
    return { folder, name };
}

/** What is in the folder, for the confirmation line and the guards. */
export function inspectFolder(folder) {
    if (!existsSync(folder)) return { exists: false, entries: 0, isWorkspace: false, mirrored: null };
    if (!statSync(folder).isDirectory()) throw new UsageError(`${folder} is not a directory`);
    const entries = readdirSync(folder).filter((e) => e !== '.workspace');
    const isWorkspace = existsSync(path.join(folder, 'workspace.json')) || existsSync(path.join(folder, '.workspace', 'workspace.json'));
    const mirrored = listMirrors().find((m) => m.mountpoint === folder) || null;
    return { exists: true, entries: entries.length, isWorkspace, mirrored };
}

/**
 * Make sure a hub workspace exists for `name`. `onExisting` decides what to
 * do when the hub already has one: 'attach' mirrors into it, 'fail' throws.
 */
export async function ensureHubWorkspace(client, remoteId, { name, label, description }, { onExisting = 'fail', io } = {}) {
    const existing = findHubWorkspace(await listHubWorkspaces(client, remoteId), name);
    if (existing) {
        if (onExisting !== 'attach') throw new UsageError(`Workspace '${name}' already exists on ${remoteId} — pass --attach to sync into it, or pick another name`);
        io?.info(`Using existing workspace '${name}' on ${remoteId}`);
        return { ws: existing, created: false };
    }
    const ws = await createHubWorkspace(client, remoteId, { name, label, description });
    io?.success(`Created workspace '${ws.name}' on ${remoteId}`);
    return { ws, created: true };
}

/** Config entry for a published folder (daemon client, in place). */
export function configurePublishedMirror({ remoteId, ws, folder, root, conflicts, deletes, managed, ignore = [] }) {
    if (findMirror(`${remoteId}/${ws.name}`)) throw new UsageError(`'${ws.name}' is already mirrored from ${remoteId}`);
    return upsertMirror(buildMirror({
        remoteId, workspaceId: ws.id, workspaceName: ws.name, folderName: ws.folderName || path.basename(folder), root, folder,
        client: 'daemon', conflicts, deletes, managed, ignore,
    }));
}

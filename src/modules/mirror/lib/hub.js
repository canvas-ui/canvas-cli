'use strict';

import { select } from '../../../core/prompt.js';
import { CanvasError, UsageError } from '../../../core/errors.js';

/** Servers answer with an envelope or a bare array depending on client mode. */
export function unwrap(res) {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.payload)) return res.payload;
    if (Array.isArray(res?.documents)) return res.documents;
    return res?.payload ?? res;
}

/** The hub for a mirror: `--hub`, else the bound remote, else a single choice. */
export async function resolveHub(flags, client, session, { interactive = true } = {}) {
    if (flags.hub) {
        if (!client.getRemote(flags.hub)) throw new UsageError(`Unknown remote '${flags.hub}' — add it with \`canvas remote add\``);
        return flags.hub;
    }
    const bound = session.boundRemote();
    if (bound && client.getRemote(bound)) return bound;
    const ids = Object.keys(client.remotes());
    if (ids.length === 0) throw new CanvasError('No remotes configured. Run `canvas remote add <user@name> <url>` first.');
    if (ids.length === 1 || !interactive) return ids[0];
    return select('Which Canvas server (hub) should this device mirror?', ids.map((id) => ({ label: id, value: id })));
}

export async function listHubWorkspaces(client, remoteId) {
    const rc = client.client(remoteId);
    const list = unwrap(await rc.workspaces.list());
    return (Array.isArray(list) ? list : []).map((w) => ({
        id: w.id,
        name: w.name,
        label: w.label || w.name,
        status: w.status,
        origin: w.origin,
    })).filter((w) => w.name);
}

'use strict';

import { UsageError } from '../../../core/errors.js';

/**
 * The agent a noun is operating on. Under the grammar it arrives in the
 * resource slot (`agent lucy session list`); the trailing form
 * (`agent session list lucy`) is kept because every agent action has always
 * accepted the name after the verb too.
 */
export async function resolveAgentHandle({ parent, args, client }) {
    if (parent.agent) return parent.agent;
    const name = args?.agent;
    if (!name) throw new UsageError('Agent name required (e.g. `canvas agent lucy session list`)');
    const resolve = (await import('../resolve.js')).default;
    return resolve(name, { client });
}

/** `/agents/<name>` with the name escaped once, in one place. */
export function agentPath(handle, tail = '') {
    return `/agents/${encodeURIComponent(handle.name)}${tail}`;
}

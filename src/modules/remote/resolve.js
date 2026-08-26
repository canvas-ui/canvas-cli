'use strict';

/**
 * A bare token after `remote` is a remote id — but only if it is one we know.
 * Unlike workspaces and contexts, remotes live entirely client-side, so this
 * can be checked without a round trip: an unknown token is left alone (it is
 * a positional for the verb, e.g. `remote add <id> <url>`).
 */
export default function resolveRemote(token, { client }) {
    const cfg = client.getRemote(token);
    return cfg ? { id: token, raw: token, config: cfg } : null;
}

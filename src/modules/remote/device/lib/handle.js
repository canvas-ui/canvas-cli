'use strict';

import { UsageError, NotFoundError } from '../../../../core/errors.js';

/**
 * The remote a device verb targets: addressed in the resource slot
 * (`remote admin@dev device show`), named after the verb, or the bound one.
 */
export function resolveRemoteId({ parent, args, client, session }) {
    const id = parent.remote?.id || args?.id || session.boundRemote();
    if (!id) throw new UsageError('Remote id required (or bind one with `canvas remote bind`)');
    const remote = client.getRemote(id);
    if (!remote) throw new NotFoundError(`Remote '${id}' not found`);
    return { id, remote };
}

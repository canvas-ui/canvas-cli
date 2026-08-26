'use strict';

import { UsageError } from '../../../core/errors.js';

/**
 * The remote a verb targets, in precedence order:
 *   1. the resource slot — `remote admin@dev ping`
 *   2. a positional after the verb — `remote ping admin@dev`
 *   3. the bound remote
 *
 * Step 1 has to come first: without it `remote admin@dev ping` would fall
 * through to the bound remote and silently ping the wrong server.
 */
export function remoteId({ parent, args, session }, { required = true } = {}) {
    const id = parent?.remote?.id || args?.id || session.boundRemote();
    if (!id && required) throw new UsageError('Remote id required (or bind one with `canvas remote bind`)');
    return id;
}

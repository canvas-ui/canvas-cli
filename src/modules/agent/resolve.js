'use strict';

import { parseAgentAddress } from '../../core/transport/address.js';
import { UsageError } from '../../core/errors.js';

export default function resolveAgent(token, { client }) {
    const parsed = parseAgentAddress(token);
    if (!parsed) throw new UsageError(`Invalid agent specifier: ${token}`);
    const remoteId = parsed.remote
        ? (client.resolveRemoteShortname(parsed.remote) || parsed.remote)
        : client.currentRemote();
    return {
        name: parsed.agentName,
        remoteId,
        api: client.client(remoteId),
        raw: token,
    };
}

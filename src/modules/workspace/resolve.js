'use strict';

export default function resolveWorkspace(token, { client }) {
    return client.resolve(token);
}

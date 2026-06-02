'use strict';

export default function resolveContext(token, { client }) {
    return client.resolve(token);
}

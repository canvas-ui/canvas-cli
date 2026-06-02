'use strict';

// Custom resolver: only consume token if it looks like a workspace address
// (has '@' or ':') so plain action words like 'status', 'list' fall through
// to the action matcher.
export default function resolveDotWorkspace(token, { client }) {
    if (!token.includes('@') && !token.includes(':')) {
        return null;
    }
    return client.resolve(token);
}

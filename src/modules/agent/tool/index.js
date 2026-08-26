'use strict';

import list from './actions/list.js';

// Read-only, and the point is diagnosis: an agent that cannot see the canvas
// tools answers plausibly and does nothing, which is indistinguishable from a
// bad prompt until you can list what it actually has.
export default {
    name: 'tool',
    pluralAlias: 'tools',
    description: 'Tools an agent can call',
    defaultAction: 'list',
    defaultPluralAction: 'list',
    needsConnection: true,
    actions: [list],
    submodules: [],
};

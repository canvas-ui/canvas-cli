'use strict';

import list from './actions/list.js';
import create from './actions/create.js';
import rm from './actions/rm.js';
import set from './actions/set.js';

// Was four flat actions with the noun hyphenated onto the verb — in both
// orders (`create-token`, `token-create`) — and a bare plural for the list.
export default {
    name: 'token',
    pluralAlias: 'tokens',
    description: 'API tokens on the bound remote',
    defaultAction: 'list',
    defaultPluralAction: 'list',
    needsConnection: true,
    actions: [list, create, rm, set],
    submodules: [],
};

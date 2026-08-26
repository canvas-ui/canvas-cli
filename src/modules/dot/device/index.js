'use strict';

import list from './actions/list.js';
import current from './actions/current.js';
import link from './actions/link.js';
import unlink from './actions/unlink.js';

// Everything about WHICH MACHINE a repo entry is mapped onto. `dot devices`
// used to print this machine and the whole link map from one action; link and
// unlink lived at module level, so the three halves of one idea sat apart.
export default {
    name: 'device',
    pluralAlias: 'devices',
    description: 'Per-device link map (which entry lives where)',
    defaultAction: 'current',
    defaultPluralAction: 'list',
    needsConnection: false,
    actions: [list, current, link, unlink],
    submodules: [],
};

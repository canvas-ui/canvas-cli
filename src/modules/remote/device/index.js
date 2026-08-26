'use strict';

import show from './actions/show.js';
import register from './actions/register.js';

// This machine's registration on a remote. The verbs were `--refresh` and
// `--register` booleans on a noun-shaped action; as verbs they are visible in
// help and cannot both be passed at once.
export default {
    name: 'device',
    pluralAlias: 'devices',
    description: 'This machine\'s registration on a remote',
    defaultAction: 'show',
    defaultPluralAction: 'show',
    needsConnection: false,
    actions: [show, register],
    submodules: [],
};

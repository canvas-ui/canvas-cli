'use strict';

import get from './actions/get.js';
import list from './actions/list.js';
import remove from './actions/remove.js';
import set from './actions/set.js';
import update from './actions/update.js';

export default {
    name: 'alias',
    description: 'Resource aliases',
    pluralAlias: 'aliases',
    defaultAction: 'list',
    defaultPluralAction: 'list',
    needsConnection: false,
    actions: [get, list, remove, set, update],
    submodules: [],
};

'use strict';

import list from './actions/list.js';
import add from './actions/add.js';
import rm from './actions/rm.js';

export default {
    name: 'skill',
    pluralAlias: 'skills',
    description: 'Skills installed on an agent',
    defaultAction: 'list',
    defaultPluralAction: 'list',
    needsConnection: true,
    actions: [list, add, rm],
    submodules: [],
};

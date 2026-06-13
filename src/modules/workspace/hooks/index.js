'use strict';

import list from './actions/list.js';
import get from './actions/get.js';
import set from './actions/set.js';
import del from './actions/delete.js';
import clone from './actions/clone.js';
import pull from './actions/pull.js';
import push from './actions/push.js';
import edit from './actions/edit.js';

export default {
    name: 'hooks',
    description: 'Workspace event hooks (git + REST)',
    aliases: ['hook'],
    defaultAction: 'list',
    needsConnection: true,
    actions: [list, get, set, del, clone, pull, push, edit],
    submodules: [],
};

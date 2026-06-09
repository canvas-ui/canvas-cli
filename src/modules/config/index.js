'use strict';

import del from './actions/delete.js';
import edit from './actions/edit.js';
import get from './actions/get.js';
import list from './actions/list.js';
import path from './actions/path.js';
import reset from './actions/reset.js';
import set from './actions/set.js';
import show from './actions/show.js';
import validate from './actions/validate.js';

export default {
    name: 'config',
    description: 'CLI configuration',
    aliases: ['cfg', 'settings'],
    defaultAction: 'show',
    needsConnection: false,
    actions: [del, edit, get, list, path, reset, set, show, validate],
    submodules: [],
};

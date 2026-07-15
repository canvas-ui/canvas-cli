'use strict';

import list from './actions/list.js';
import show from './actions/show.js';
import add from './actions/add.js';
import remove from './actions/remove.js';
import update from './actions/update.js';
import sync from './actions/sync.js';

export default {
    name: 'backends',
    description: 'Workspace data backends (local folder mounts, imap, …)',
    aliases: ['backend'],
    defaultAction: 'list',
    needsConnection: true,
    actions: [list, show, add, remove, update, sync],
    submodules: [],
};

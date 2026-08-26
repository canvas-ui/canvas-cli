'use strict';

import add from './actions/add.js';
import apply from './actions/apply.js';
import clone from './actions/clone.js';
import init from './actions/init.js';
import list from './actions/list.js';
import pull from './actions/pull.js';
import push from './actions/push.js';
import remove from './actions/remove.js';
import status from './actions/status.js';
import sync from './actions/sync.js';
import unapply from './actions/unapply.js';

import resolve from './resolve.js';
import device from './device/index.js';

export default {
    name: 'dot',
    description: 'Workspace-backed dotfile manager (per-device link map)',
    defaultAction: 'status',
    needsConnection: false,
    resourceArg: { name: 'workspace', resolve, optional: true },
    actions: [add, apply, clone, init, list, pull, push, remove, status, sync, unapply],
    submodules: [device],
};

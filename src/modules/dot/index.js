'use strict';

import add from './actions/add.js';
import apply from './actions/apply.js';
import clone from './actions/clone.js';
import devices from './actions/devices.js';
import init from './actions/init.js';
import link from './actions/link.js';
import list from './actions/list.js';
import pull from './actions/pull.js';
import push from './actions/push.js';
import remove from './actions/remove.js';
import status from './actions/status.js';
import sync from './actions/sync.js';
import unapply from './actions/unapply.js';
import unlink from './actions/unlink.js';

import resolve from './resolve.js';

export default {
    name: 'dot',
    description: 'Workspace-backed dotfile manager (per-device link map)',
    defaultAction: 'status',
    needsConnection: false,
    resourceArg: { name: 'workspace', resolve, optional: true },
    actions: [add, apply, clone, devices, init, link, list, pull, push, remove, status, sync, unapply, unlink],
    submodules: [],
};

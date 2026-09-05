'use strict';

import init from './actions/init.js';
import add from './actions/add.js';
import remove from './actions/remove.js';
import list from './actions/list.js';
import status from './actions/status.js';
import start from './actions/start.js';
import stop from './actions/stop.js';
import sync from './actions/sync.js';
import pin from './actions/pin.js';
import conflicts from './actions/conflicts.js';
import service from './actions/service.js';
import logs from './actions/logs.js';

// Device mirrors: workspaces kept in sync as real folders on this machine
// (canvas-fuse --mirror). `canvas mirror init` is the roaming-profile setup.
export default {
    name: 'mirror',
    description: 'Mirror workspaces to ~/Workspaces on this device',
    aliases: ['mirrors'],
    pluralAlias: 'mirrors',
    defaultAction: 'status',
    defaultPluralAction: 'list',
    needsConnection: false,
    actions: [init, add, remove, list, status, start, stop, sync, pin, conflicts, service, logs],
    submodules: [],
};

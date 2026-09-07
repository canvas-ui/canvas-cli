'use strict';

import init from './actions/init.js';
import add from './actions/add.js';
import publish from './actions/publish.js';
import remove from './actions/remove.js';
import list from './actions/list.js';
import status from './actions/status.js';
import start from './actions/start.js';
import stop from './actions/stop.js';
import restart from './actions/restart.js';
import sync from './actions/sync.js';
import pin from './actions/pin.js';
import conflicts from './actions/conflicts.js';
import service from './actions/service.js';
import logs from './actions/logs.js';
import edge from './actions/edge.js';

/*
 * @augmentd-labs/canvas-cli-mirror — the `canvas remote mirror` module:
 * workspaces kept in sync as real folders on this device (canvas-edge daemon
 * or canvas-fuse --mirror), the first-run wizard, pm2 supervision. Fetched on
 * demand by the core CLI (`canvas package install mirror`); mounted under
 * `remote` by the core's package catalog.
 */
export default {
    name: 'mirror',
    description: 'Mirror workspaces to ~/Workspaces on this device (remote mirror …)',
    aliases: ['mirrors'],
    pluralAlias: 'mirrors',
    defaultAction: 'status',
    defaultPluralAction: 'list',
    needsConnection: false,
    actions: [init, add, publish, remove, list, status, start, stop, restart, sync, pin, conflicts, service, logs, edge],
    submodules: [],
};

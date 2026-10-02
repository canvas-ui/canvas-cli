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
import direction from './actions/direction.js';
import docker from './actions/docker.js';
import supervisor from './actions/supervisor.js';
import service from './actions/service.js';
import logs from './actions/logs.js';
import edge from './actions/edge.js';
import { edgeService } from './lib/service.js';

/*
 * `canvas remote mirror` — workspaces kept in sync as real folders on this
 * device (canvas-edge daemon or canvas-fuse --mirror), the first-run wizard,
 * pm2 supervision. A submodule of `remote`, also reachable as the top-level
 * `canvas mirror …`. Built into the CLI since 2.11.0 (before: the lazily
 * installed @augmentd-labs/canvas-cli-mirror package); the canvas-edge runtime
 * it drives is still fetched on first use (lib/edge.js).
 */
export default {
    name: 'mirror',
    description: 'Mirror workspaces to ~/Workspaces on this device (remote mirror …)',
    aliases: ['mirrors'],
    pluralAlias: 'mirrors',
    defaultAction: 'status',
    defaultPluralAction: 'list',
    needsConnection: false,
    actions: [init, add, publish, remove, list, status, start, stop, restart, sync, pin, conflicts, direction, docker, supervisor, service, logs, edge],
    submodules: [],
    // Also mounted at the top level: `canvas mirror x` === `canvas remote mirror x` (core/registry.js).
    topLevel: true,
    // Local services `canvas update` checks and refreshes (modules/update/lib.js).
    services: [edgeService],
};

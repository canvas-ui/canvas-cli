'use strict';

import run from './actions/run.js';
import check from './actions/check.js';

/*
 * `canvas update` — check for and apply updates to everything Canvas put on
 * this device: the CLI itself, the lazily installed CLI packages
 * (`canvas package …`) and the local services those packages run
 * (canvas-edge; a local canvas-server). `canvas update check` only reports.
 */
export default {
    name: 'update',
    description: 'Update the CLI, its packages and local services (canvas-edge, canvas-server): `update [check] [cli|packages|services|<service>]`',
    aliases: ['upgrade', 'self-update'],
    defaultAction: 'run',
    needsConnection: false,
    actions: [run, check],
    submodules: [],
};

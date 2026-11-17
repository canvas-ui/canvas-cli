'use strict';

import add from './actions/add.js';
import list from './actions/list.js';
import remove from './actions/remove.js';
import scan from './actions/scan.js';

/*
 * `canvas workspace <ws> share` — folders of this machine served to a
 * workspace as read-only storage backends (driver `share`). Unlike a mirror,
 * nothing is copied: the canvas-edge daemon indexes the folder where it is
 * and the workspace reads from it on demand, so an external drive or a NAS
 * volume is cataloged whole and stays searchable while it is unplugged.
 */
export default {
    name: 'share',
    description: 'Serve local folders to the workspace in place (NAS volumes, external drives)',
    aliases: ['shares'],
    defaultAction: 'list',
    needsConnection: true,
    actions: [add, list, remove, scan],
    submodules: [],
};

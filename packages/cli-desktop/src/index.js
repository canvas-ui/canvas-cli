'use strict';

import install from './actions/install.js';
import open from './actions/open.js';
import status from './actions/status.js';

/*
 * @augmentd-labs/canvas-cli-desktop — the `canvas desktop` module: fetch the
 * desktop app release for this platform and launch it. Fetched on demand by
 * the core CLI (`canvas package install desktop`).
 */
export default {
    name: 'desktop',
    description: 'Canvas desktop app: install (download the release) and open',
    defaultAction: 'status',
    needsConnection: false,
    actions: [install, open, status],
    submodules: [],
};

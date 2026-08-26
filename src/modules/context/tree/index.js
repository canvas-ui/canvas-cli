'use strict';

import show from './actions/show.js';
import paths from './actions/paths.js';

// A context has exactly one tree — its own — so no list verb here.
export default {
    name: 'tree',
    description: 'The context tree',
    defaultAction: 'show',
    needsConnection: true,
    actions: [show, paths],
    submodules: [],
};

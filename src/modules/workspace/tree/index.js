'use strict';

import show from './actions/show.js';
import paths from './actions/paths.js';
import rm from './actions/rm.js';
import list from './actions/list.js';

// A workspace has several trees (`directory`, `backends`, …), so the plural
// lists them and the singular shows the one you name with --tree.
export default {
    name: 'tree',
    pluralAlias: 'trees',
    description: 'Workspace trees (directory, backends, …)',
    defaultAction: 'show',
    defaultPluralAction: 'list',
    needsConnection: true,
    actions: [show, list, paths, rm],
    submodules: [],
};

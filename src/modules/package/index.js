'use strict';

import install from './actions/install.js';
import list from './actions/list.js';
import remove from './actions/remove.js';
import update from './actions/update.js';

// Lazily installed CLI packages (core/packages.js): mirror, server, desktop.
export default {
    name: 'package',
    description: 'CLI packages fetched on demand: mirror, server, desktop (list, install, update, remove)',
    aliases: ['packages', 'pkg'],
    pluralAlias: 'packages',
    defaultAction: 'list',
    defaultPluralAction: 'list',
    needsConnection: false,
    actions: [list, install, update, remove],
    submodules: [],
};

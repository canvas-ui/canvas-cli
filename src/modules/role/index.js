'use strict';

import list from './actions/list.js';
import show from './actions/show.js';

export default {
    name: 'role',
    description: 'Container/role orchestration (placeholder)',
    aliases: ['ag-role'],
    pluralAlias: 'roles',
    defaultAction: 'list',
    defaultPluralAction: 'list',
    needsConnection: true,
    actions: [list, show],
    submodules: [],
};

'use strict';

import list from './actions/list.js';
import prompt from './actions/prompt.js';
import status from './actions/status.js';

export default {
    name: 'agent',
    description: 'Workspace-scoped agents',
    aliases: ['agents'],
    defaultAction: 'list',
    needsConnection: true,
    actions: [list, prompt, status],
    submodules: [],
};

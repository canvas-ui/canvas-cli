'use strict';

import list from './actions/list.js';
import current from './actions/current.js';
import create from './actions/new.js';
import use from './actions/use.js';
import rename from './actions/rename.js';
import rm from './actions/rm.js';

// Conversation continuity, which the runtime has always had and the CLI could
// not reach: it exposed `sessions` (list) and `session` (current) as two
// actions and nothing else, so there was no way to start a second thread,
// switch back to one, or delete a stale one from a terminal.
export default {
    name: 'session',
    pluralAlias: 'sessions',
    description: 'Agent conversation sessions',
    defaultAction: 'current',
    defaultPluralAction: 'list',
    needsConnection: true,
    actions: [list, current, create, use, rename, rm],
    submodules: [],
};

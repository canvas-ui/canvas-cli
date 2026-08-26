'use strict';

import create from './actions/create.js';
import current from './actions/current.js';
import del from './actions/delete.js';
import list from './actions/list.js';
import show from './actions/show.js';
import start from './actions/start.js';
import status from './actions/status.js';
import stop from './actions/stop.js';
import update from './actions/update.js';

import hooks from './hooks/index.js';
import agent from './agent/index.js';
import backends from './backends/index.js';
import tree from './tree/index.js';
import resolve from './resolve.js';
import { documentNouns } from '../../core/nouns.js';

export default {
    name: 'workspace',
    description: 'Manage workspaces',
    aliases: ['ws'],
    pluralAlias: 'workspaces',
    defaultAction: 'list',
    defaultPluralAction: 'list',
    // A named resource with no verb shows it: `ws universe` == `ws universe show`.
    defaultResourceAction: 'show',
    needsConnection: true,
    resourceArg: { name: 'workspace', resolve, optional: true },
    actions: [create, current, del, list, show, start, status, stop, update],
    submodules: [agent, hooks, backends, tree, ...documentNouns('workspace')],
};

'use strict';

import bind from './actions/bind.js';
import create from './actions/create.js';
import current from './actions/current.js';
import destroy from './actions/destroy.js';
import list from './actions/list.js';
import path from './actions/path.js';
import paths from './actions/paths.js';
import set from './actions/set.js';
import show from './actions/show.js';
import tree from './actions/tree.js';
import update from './actions/update.js';
import url from './actions/url.js';
import workspace from './actions/workspace.js';

import resolve from './resolve.js';
import { documentNouns } from '../../core/nouns.js';

export default {
    name: 'context',
    description: 'Manage contexts',
    aliases: ['ctx'],
    pluralAlias: 'contexts',
    defaultAction: 'current',
    defaultPluralAction: 'list',
    // A named resource with no verb shows it: `ws universe` == `ws universe show`.
    defaultResourceAction: 'show',
    needsConnection: true,
    resourceArg: { name: 'context', resolve, optional: true },
    actions: [bind, create, current, destroy, list, path, paths, set, show, tree, update, url, workspace],
    submodules: documentNouns('context'),
};

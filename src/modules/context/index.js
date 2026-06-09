'use strict';

import add from './actions/add.js';
import bind from './actions/bind.js';
import create from './actions/create.js';
import current from './actions/current.js';
import destroy from './actions/destroy.js';
import documents from './actions/documents.js';
import dotfiles from './actions/dotfiles.js';
import list from './actions/list.js';
import notes from './actions/notes.js';
import path from './actions/path.js';
import paths from './actions/paths.js';
import set from './actions/set.js';
import show from './actions/show.js';
import tabs from './actions/tabs.js';
import tree from './actions/tree.js';
import update from './actions/update.js';
import url from './actions/url.js';
import workspace from './actions/workspace.js';

import resolve from './resolve.js';

export default {
    name: 'context',
    description: 'Manage contexts',
    aliases: ['ctx'],
    pluralAlias: 'contexts',
    defaultAction: 'current',
    defaultPluralAction: 'list',
    needsConnection: true,
    resourceArg: { name: 'context', resolve, optional: true },
    actions: [add, bind, create, current, destroy, documents, dotfiles, list, notes, path, paths, set, show, tabs, tree, update, url, workspace],
    submodules: [],
};

'use strict';

import add from './actions/add.js';
import create from './actions/create.js';
import current from './actions/current.js';
import del from './actions/delete.js';
import documents from './actions/documents.js';
import dotfiles from './actions/dotfiles.js';
import list from './actions/list.js';
import notes from './actions/notes.js';
import show from './actions/show.js';
import start from './actions/start.js';
import status from './actions/status.js';
import stop from './actions/stop.js';
import tabs from './actions/tabs.js';
import tree from './actions/tree.js';
import update from './actions/update.js';

import agent from './agent/index.js';
import resolve from './resolve.js';

export default {
    name: 'workspace',
    description: 'Manage workspaces',
    aliases: ['ws'],
    pluralAlias: 'workspaces',
    defaultAction: 'list',
    defaultPluralAction: 'list',
    needsConnection: true,
    resourceArg: { name: 'workspace', resolve, optional: true },
    actions: [add, create, current, del, documents, dotfiles, list, notes, show, start, status, stop, tabs, tree, update],
    submodules: [agent],
};

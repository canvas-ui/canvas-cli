'use strict';

import create from './actions/create.js';
import del from './actions/delete.js';
import list from './actions/list.js';
import prompt from './actions/prompt.js';
import restart from './actions/restart.js';
import show from './actions/show.js';
import start from './actions/start.js';
import status from './actions/status.js';
import stop from './actions/stop.js';
import update from './actions/update.js';

import resolve from './resolve.js';
import session from './session/index.js';
import skill from './skill/index.js';
import tool from './tool/index.js';

export default {
    name: 'agent',
    description: 'Manage agents and prompt them',
    aliases: ['ag', 'hi'],
    pluralAlias: 'agents',
    defaultAction: 'prompt',
    defaultPluralAction: 'list',
    needsConnection: true,
    resourceArg: { name: 'agent', resolve, optional: true },
    actions: [create, del, list, prompt, restart, show, start, status, stop, update],
    submodules: [session, skill, tool],
};

'use strict';

import create from './actions/create.js';
import del from './actions/delete.js';
import list from './actions/list.js';
import prompt from './actions/prompt.js';
import restart from './actions/restart.js';
import session from './actions/session.js';
import sessions from './actions/sessions.js';
import show from './actions/show.js';
import skills from './actions/skills.js';
import start from './actions/start.js';
import status from './actions/status.js';
import stop from './actions/stop.js';
import update from './actions/update.js';

import resolve from './resolve.js';

export default {
    name: 'agent',
    description: 'Manage agents and prompt them',
    aliases: ['ag', 'hi'],
    pluralAlias: 'agents',
    defaultAction: 'prompt',
    defaultPluralAction: 'list',
    needsConnection: true,
    resourceArg: { name: 'agent', resolve, optional: true },
    actions: [create, del, list, prompt, restart, session, sessions, show, skills, start, status, stop, update],
    submodules: [],
};

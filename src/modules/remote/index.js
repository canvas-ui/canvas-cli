'use strict';

import add from './actions/add.js';
import bind from './actions/bind.js';
import current from './actions/current.js';
import list from './actions/list.js';
import login from './actions/login.js';
import logout from './actions/logout.js';
import ping from './actions/ping.js';
import remove from './actions/remove.js';
import rename from './actions/rename.js';
import show from './actions/show.js';
import sync from './actions/sync.js';

import device from './device/index.js';
import resolve from './resolve.js';

export default {
    name: 'remote',
    description: 'Manage remote Canvas servers',
    aliases: ['remotes'],
    pluralAlias: 'remotes',
    defaultAction: 'current',
    defaultPluralAction: 'list',
    // `remote admin@dev` shows it, same rule as `ws <name>`.
    defaultResourceAction: 'show',
    needsConnection: false,
    // A known remote id in the resource slot: `remote admin@dev ping`,
    // `remote admin@dev device show`. Unknown tokens stay positionals.
    resourceArg: { name: 'remote', resolve, optional: true },
    actions: [add, bind, current, list, login, logout, ping, remove, rename, show, sync],
    submodules: [device],
};

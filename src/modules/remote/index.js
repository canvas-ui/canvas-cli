'use strict';

import add from './actions/add.js';
import bind from './actions/bind.js';
import current from './actions/current.js';
import device from './actions/device.js';
import list from './actions/list.js';
import login from './actions/login.js';
import logout from './actions/logout.js';
import ping from './actions/ping.js';
import remove from './actions/remove.js';
import rename from './actions/rename.js';
import show from './actions/show.js';
import sync from './actions/sync.js';

export default {
    name: 'remote',
    description: 'Manage remote Canvas servers',
    aliases: ['remotes'],
    pluralAlias: 'remotes',
    defaultAction: 'current',
    defaultPluralAction: 'list',
    needsConnection: false,
    actions: [add, bind, current, device, list, login, logout, ping, remove, rename, show, sync],
    submodules: [],
};

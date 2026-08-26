'use strict';

import login from './actions/login.js';
import logout from './actions/logout.js';
import profile from './actions/profile.js';
import status from './actions/status.js';

import token from './token/index.js';

export default {
    name: 'auth',
    description: 'Authentication & API tokens',
    defaultAction: 'status',
    needsConnection: false,
    actions: [login, logout, profile, status],
    submodules: [token],
};

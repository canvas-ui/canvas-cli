'use strict';

import createToken from './actions/create-token.js';
import deleteToken from './actions/delete-token.js';
import login from './actions/login.js';
import logout from './actions/logout.js';
import profile from './actions/profile.js';
import setToken from './actions/set-token.js';
import status from './actions/status.js';
import tokens from './actions/tokens.js';

export default {
    name: 'auth',
    description: 'Authentication & API tokens',
    defaultAction: 'status',
    needsConnection: false,
    actions: [createToken, deleteToken, login, logout, profile, setToken, status, tokens],
    submodules: [],
};

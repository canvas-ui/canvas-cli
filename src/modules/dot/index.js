'use strict';

export default {
    name: 'dot',
    description: 'Workspace-backed dotfile manager (per-device link map)',
    defaultAction: 'status',
    needsConnection: false,
    resourceArg: {
        name: 'workspace',
        resolver: './resolve.js',
        optional: true,
    },
};

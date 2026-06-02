'use strict';

export default {
    name: 'workspace',
    description: 'Manage workspaces',
    aliases: ['ws'],
    pluralAlias: 'workspaces',
    defaultAction: 'current',
    defaultPluralAction: 'list',
    needsConnection: true,
    resourceArg: {
        name: 'workspace',
        resolver: './resolve.js',
        optional: true,
    },
    submodules: ['agent'],
};

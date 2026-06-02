'use strict';

export default {
    name: 'context',
    description: 'Manage contexts',
    aliases: ['ctx'],
    pluralAlias: 'contexts',
    defaultAction: 'current',
    defaultPluralAction: 'list',
    needsConnection: true,
    resourceArg: {
        name: 'context',
        resolver: './resolve.js',
        optional: true,
    },
};

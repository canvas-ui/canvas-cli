'use strict';

export default {
    name: 'agent',
    description: 'Manage agents and prompt them',
    aliases: ['ag', 'hi'],
    pluralAlias: 'agents',
    defaultAction: 'prompt',
    defaultPluralAction: 'list',
    needsConnection: true,
    resourceArg: {
        name: 'agent',
        resolver: './resolve.js',
        optional: true,
    },
};

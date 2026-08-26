'use strict';

// What a context is, minus the machinery. The full document (bitmaps, ACLs,
// tree ids, toolbox metadata) is ~30 fields and unreadable as a table; -f json
// still carries all of it.
export const CONTEXT_COLUMNS = [
    'id',
    { key: 'url', label: 'url' },
    { key: 'workspaceName', label: 'workspace' },
    { key: 'path', label: 'path' },
    { key: 'workspaceActive', label: 'active', format: 'bool' },
    { key: 'locked', label: 'locked', format: 'bool' },
    { key: 'color', label: 'color' },
    { key: 'updatedAt', label: 'updated', format: 'date' },
];

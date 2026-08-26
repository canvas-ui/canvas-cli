'use strict';

// See context/lib/columns.js — same reasoning, ~25 fields down to what
// identifies a workspace and says whether it is running.
export const WORKSPACE_COLUMNS = [
    'id',
    'name',
    'label',
    'type',
    'status',
    'owner',
    { key: 'color', label: 'color' },
    { key: 'updatedAt', label: 'updated', format: 'date' },
];

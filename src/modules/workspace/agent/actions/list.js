'use strict';

import { UsageError } from '../../../../core/errors.js';

export default {
    name: 'list',
    description: 'List agents bound to workspace',
    async run({ parent, io }) {
        if (!parent.workspace) throw new UsageError('Workspace address required');
        const all = await parent.workspace.api.agents.list();
        const rows = (Array.isArray(all) ? all : all?.agents || [])
            .filter((a) => !a.workspaceId || a.workspaceId === parent.workspace.id);
        io.output(rows, { columns: ['id', 'name', 'label', 'status'] });
    },
};

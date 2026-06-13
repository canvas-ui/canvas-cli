'use strict';

import { UsageError } from '../../../../core/errors.js';

export function resolveHandle({ parent }) {
    if (parent?.workspace) return parent.workspace;
    throw new UsageError('Workspace required: canvas ws <name> hooks <action>');
}

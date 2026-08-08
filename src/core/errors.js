'use strict';

// Error classes come from the shared client so `instanceof` checks hold
// across the cli and @canvas/api-client boundaries. UsageError is cli-only
// (flag/argument problems, exit code 2).
import { CanvasError } from '@canvas/api-client';

export { CanvasError, AuthError, NotFoundError } from '@canvas/api-client';

export class UsageError extends CanvasError {
    constructor(message) {
        super(message, { code: 'USAGE' });
        this.name = 'UsageError';
    }
}

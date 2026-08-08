'use strict';

// Error classes come from the shared client so `instanceof` checks hold
// across the cli and @canvas-os/api-client boundaries. UsageError is cli-only
// (flag/argument problems, exit code 2).
import { CanvasError } from '@canvas-os/api-client';

export { CanvasError, AuthError, NotFoundError } from '@canvas-os/api-client';

export class UsageError extends CanvasError {
    constructor(message) {
        super(message, { code: 'USAGE' });
        this.name = 'UsageError';
    }
}

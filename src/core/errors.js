'use strict';

export class CanvasError extends Error {
    constructor(message, { code, status, cause } = {}) {
        super(message);
        this.name = 'CanvasError';
        this.code = code || 'CANVAS_ERROR';
        this.status = status;
        if (cause) this.cause = cause;
    }
}

export class UsageError extends CanvasError {
    constructor(message) {
        super(message, { code: 'USAGE' });
        this.name = 'UsageError';
    }
}

export class NotFoundError extends CanvasError {
    constructor(message) {
        super(message, { code: 'NOT_FOUND', status: 404 });
        this.name = 'NotFoundError';
    }
}

export class AuthError extends CanvasError {
    constructor(message) {
        super(message, { code: 'AUTH', status: 401 });
        this.name = 'AuthError';
    }
}

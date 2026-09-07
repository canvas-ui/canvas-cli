'use strict';

/**
 * @augmentd-labs/canvas-cli-host — what a Canvas CLI extension package may
 * rely on. The core CLI uses these same modules (its src/core/* re-export
 * them), so an extension running inside the CLI and the CLI itself share one
 * implementation. Extensions are separate npm packages fetched on demand
 * into ~/.canvas/packages/<key>; they bundle their own copy of this SDK, so
 * never compare error classes across the boundary — use `err.code`.
 */

export * from './errors.js';
export * as prompt from './prompt.js';
export * as paths from './paths.js';
export * as storage from './storage.js';
export * as pm2 from './pm2.js';
export * as address from './address.js';
export { default as device } from './device.js';
export { ensureDeviceRegistered } from './device-registration.js';
export { installIntoPrefix, installedInPrefix } from './prefix-install.js';

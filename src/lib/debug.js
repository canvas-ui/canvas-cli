"use strict";

import debugInstance from "debug";

/**
 * Setup debug logging
 * @param {string} namespace - Debug namespace
 * @returns {Function} Debug function
 */
export function setupDebug(namespace) {
  return debugInstance(namespace);
}

/**
 * Enable debug for specific namespaces
 * @param {string} namespaces - Comma-separated debug namespaces
 */
export function enableDebug(namespaces) {
  process.env.DEBUG = namespaces;
  debugInstance.enabled = () => true;
}

/**
 * Disable debug logging
 */
export function disableDebug() {
  delete process.env.DEBUG;
  debugInstance.enabled = () => false;
}

export default setupDebug;

"use strict";

import os from "os";

/**
 * Windows compatibility utilities for Canvas CLI
 * Fixes console output issues on Windows when bundled with bun
 */

// Detect if we're running on Windows
const isWindows = os.platform() === "win32";

// Detect if we're in a bundled executable
const isBundled = process.pkg || process.isBun || typeof Bun !== "undefined";

/**
 * Initialize Windows console compatibility
 * This should be called early in the application startup
 */
export function initWindowsCompat() {
  if (!isWindows) return;

  // Force enable color support on Windows
  if (process.env.FORCE_COLOR === undefined) {
    process.env.FORCE_COLOR = "1";
  }

  // Ensure console methods exist and work properly
  if (isBundled) {
    // In bundled executables, sometimes console methods get overridden
    // Ensure they're properly bound to the original console
    const originalConsole = globalThis.console;

    if (!originalConsole.log || !originalConsole.error) {
      // Fallback to process.stdout/stderr if console is broken
      if (!originalConsole.log) {
        originalConsole.log = (...args) => {
          process.stdout.write(args.join(" ") + "\n");
        };
      }

      if (!originalConsole.error) {
        originalConsole.error = (...args) => {
          process.stderr.write(args.join(" ") + "\n");
        };
      }

      if (!originalConsole.warn) {
        originalConsole.warn = originalConsole.error;
      }

      if (!originalConsole.info) {
        originalConsole.info = originalConsole.log;
      }
    }
  }

  // Ensure proper TTY detection
  if (process.stdout && typeof process.stdout.isTTY === "undefined") {
    // Assume TTY if we can't detect it properly
    process.stdout.isTTY = true;
  }

  if (process.stderr && typeof process.stderr.isTTY === "undefined") {
    process.stderr.isTTY = true;
  }

  // Set up proper encoding
  if (process.stdout && process.stdout.setEncoding) {
    try {
      process.stdout.setEncoding("utf8");
    } catch (error) {
      // Ignore encoding errors
    }
  }

  if (process.stderr && process.stderr.setEncoding) {
    try {
      process.stderr.setEncoding("utf8");
    } catch (error) {
      // Ignore encoding errors
    }
  }
}

/**
 * Safe console.log that works on Windows bundled executables
 */
export function safeLog(...args) {
  try {
    console.log(...args);
  } catch (error) {
    // Fallback to direct stdout write
    try {
      process.stdout.write(args.join(" ") + "\n");
    } catch (fallbackError) {
      // Last resort - do nothing rather than crash
    }
  }
}

/**
 * Safe console.error that works on Windows bundled executables
 */
export function safeError(...args) {
  try {
    console.error(...args);
  } catch (error) {
    // Fallback to direct stderr write
    try {
      process.stderr.write(args.join(" ") + "\n");
    } catch (fallbackError) {
      // Last resort - do nothing rather than crash
    }
  }
}

/**
 * Check if we need Windows compatibility fixes
 */
export function needsWindowsCompat() {
  return isWindows && isBundled;
}

/**
 * Get platform-specific information for debugging
 */
export function getPlatformInfo() {
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    isWindows,
    isBundled,
    hasConsole: typeof console !== "undefined" && !!console.log,
    hasStdout: typeof process !== "undefined" && !!process.stdout,
    stdoutIsTTY: process.stdout?.isTTY,
    forceColor: process.env.FORCE_COLOR,
    nodeVersion: process.version,
    isBun: typeof Bun !== "undefined",
  };
}

export default {
  initWindowsCompat,
  safeLog,
  safeError,
  needsWindowsCompat,
  getPlatformInfo,
  isWindows,
  isBundled,
};

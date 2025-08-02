"use strict";

import Conf from "conf";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import pkg from "node-machine-id";
const { machineIdSync } = pkg;
import debugInstance from "debug";
const debug = debugInstance("canvas:cli:config");

/**
 * Constants
 */

const MACHINE_ID = machineIdSync(true);
const APP_ID = "canvas-cli";

function getUserHome() {
  const SERVER_MODE = process.env.SERVER_MODE || "user";
  const SERVER_HOME = process.env.SERVER_HOME || process.cwd();

  if (SERVER_MODE === "user") {
    const homeDir = os.homedir();
    if (process.platform === "win32") {
      return path.join(homeDir, "Canvas");
    } else {
      return path.join(homeDir, ".canvas");
    }
  }

  return path.join(SERVER_HOME, "users");
}

const CANVAS_USER_HOME = process.env.CANVAS_USER_HOME || getUserHome();

// CLI config files in config directory
const CLI_CONFIG_DIR = path.join(CANVAS_USER_HOME, "config");
const REMOTES_FILE = path.join(CLI_CONFIG_DIR, "remotes.json");
const CONTEXTS_FILE = path.join(CLI_CONFIG_DIR, "contexts.index.json");
const WORKSPACES_FILE = path.join(CLI_CONFIG_DIR, "workspaces.index.json");
const ALIASES_FILE = path.join(CLI_CONFIG_DIR, "cli-aliases.json");
const SESSION_CLI_FILE = path.join(CLI_CONFIG_DIR, "cli-session.json");

// Default configuration for main config (simplified for resource address schema)
const DEFAULT_CONFIG = {
  connectors: {
    ollama: {
      driver: "ollama",
      host: "http://localhost:11434",
      model: "qwen2.5-coder:latest",
      defaultModel: "qwen2.5-coder:latest",
    },
    docker: {
      driver: "docker",
      host: "unix:///var/run/docker.sock",
    },
    anthropic: {
      driver: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      model: "claude-3-5-sonnet-20241022",
      defaultModel: "claude-3-5-sonnet-20241022",
      maxTokens: 4096,
    },
    openai: {
      driver: "openai",
      apiKey: process.env.OPENAI_API_KEY || "",
      model: "gpt-4o",
      defaultModel: "gpt-4o",
      maxTokens: 4096,
    },
  },
  ai: {
    defaultConnector: "anthropic",
    priority: ["anthropic", "openai", "ollama"],
    contextTemplate: "canvas-assistant",
  },
  sync: {
    autoSyncInterval: 5, // minutes
    staleThreshold: 15, // minutes - when to consider cache stale
    enabled: true,
  },
};

// Default remote configuration (empty - users must add remotes explicitly)
const DEFAULT_REMOTE_CONFIG = {};

// Default aliases configuration (empty - users can add aliases as needed)
const DEFAULT_ALIASES_CONFIG = {};

// Default session configuration
const DEFAULT_SESSION_CONFIG = {
  boundRemote: null,
  defaultWorkspace: null,
  boundContext: null,
  boundAt: null,
};

const CLIENT_CONTEXT_ARRAY = generateClientContextArray();

const EXIT_CODES = {
  ERROR: 87, // https://xkcd.com/221/
  FAILED: 1,
  SUCCESS: 0,
};

// Main config using Conf library
const config = new Conf({
  projectName: "canvas",
  configName: "cli",
  cwd: CLI_CONFIG_DIR,
  defaults: DEFAULT_CONFIG,
  configFileMode: 0o600, // Secure file permissions
});

/**
 * Remote management utilities
 */
class RemoteStore {
  constructor() {
    this.remotesFile = REMOTES_FILE;
    this.contextsFile = CONTEXTS_FILE;
    this.workspacesFile = WORKSPACES_FILE;
    this.aliasesFile = ALIASES_FILE;
    this.sessionFile = SESSION_CLI_FILE;
    this.ensureFiles();
  }

  async ensureFiles() {
    // Ensure directories exist
    await fs.mkdir(CANVAS_USER_HOME, { recursive: true });
    await fs.mkdir(CLI_CONFIG_DIR, { recursive: true });

    // Initialize files if they don't exist
    if (!existsSync(this.remotesFile)) {
      await this.writeFile(this.remotesFile, DEFAULT_REMOTE_CONFIG);
    }
    if (!existsSync(this.contextsFile)) {
      await this.writeFile(this.contextsFile, {});
    }
    if (!existsSync(this.workspacesFile)) {
      await this.writeFile(this.workspacesFile, {});
    }
    if (!existsSync(this.aliasesFile)) {
      await this.writeFile(this.aliasesFile, DEFAULT_ALIASES_CONFIG);
    }
    if (!existsSync(this.sessionFile)) {
      await this.writeFile(this.sessionFile, DEFAULT_SESSION_CONFIG);
    }
  }

  async readFile(filePath) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      debug(`Error reading ${filePath}:`, error.message);
      return {};
    }
  }

  async writeFile(filePath, data) {
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), {
        mode: 0o600,
      });
    } catch (error) {
      debug(`Error writing ${filePath}:`, error.message);
      throw error;
    }
  }

  // Remote management
  async getRemotes() {
    return this.readFile(this.remotesFile);
  }

  async getRemote(remoteId) {
    const remotes = await this.getRemotes();
    return remotes[remoteId] || null;
  }

  async addRemote(remoteId, remoteConfig) {
    const remotes = await this.getRemotes();
    remotes[remoteId] = {
      ...remoteConfig,
      lastSynced: new Date().toISOString(),
    };
    await this.writeFile(this.remotesFile, remotes);
  }

  async removeRemote(remoteId) {
    const remotes = await this.getRemotes();
    delete remotes[remoteId];
    await this.writeFile(this.remotesFile, remotes);

    // Also clean up contexts and workspaces for this remote
    await this.cleanupRemoteData(remoteId);
  }

  async updateRemote(remoteId, updates) {
    const remotes = await this.getRemotes();
    if (remotes[remoteId]) {
      remotes[remoteId] = { ...remotes[remoteId], ...updates };
      await this.writeFile(this.remotesFile, remotes);
    }
  }

  // Context management
  async getContexts() {
    return this.readFile(this.contextsFile);
  }

  async getContext(contextKey) {
    const contexts = await this.getContexts();
    return contexts[contextKey] || null;
  }

  async updateContext(contextKey, contextData) {
    const contexts = await this.getContexts();
    contexts[contextKey] = {
      ...contextData,
      lastSynced: new Date().toISOString(),
    };
    await this.writeFile(this.contextsFile, contexts);
  }

  async removeContext(contextKey) {
    const contexts = await this.getContexts();
    delete contexts[contextKey];
    await this.writeFile(this.contextsFile, contexts);
  }

  // Workspace management
  async getWorkspaces() {
    return this.readFile(this.workspacesFile);
  }

  async getWorkspace(workspaceKey) {
    const workspaces = await this.getWorkspaces();
    return workspaces[workspaceKey] || null;
  }

  async updateWorkspace(workspaceKey, workspaceData) {
    const workspaces = await this.getWorkspaces();
    workspaces[workspaceKey] = {
      ...workspaceData,
      lastSynced: new Date().toISOString(),
    };
    await this.writeFile(this.workspacesFile, workspaces);
  }

  async removeWorkspace(workspaceKey) {
    const workspaces = await this.getWorkspaces();
    delete workspaces[workspaceKey];
    await this.writeFile(this.workspacesFile, workspaces);
  }

  // Session management
  async getSession() {
    return this.readFile(this.sessionFile);
  }

  async updateSession(updates) {
    const session = await this.getSession();
    const updatedSession = { ...session, ...updates };
    await this.writeFile(this.sessionFile, updatedSession);
  }

  // Aliases management
  async getAliases() {
    return this.readFile(this.aliasesFile);
  }

  async getAlias(alias) {
    const aliases = await this.getAliases();
    return aliases[alias] || null;
  }

  async setAlias(alias, resourceAddress) {
    const aliases = await this.getAliases();
    aliases[alias] = {
      address: resourceAddress,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.writeFile(this.aliasesFile, aliases);
  }

  async removeAlias(alias) {
    const aliases = await this.getAliases();
    delete aliases[alias];
    await this.writeFile(this.aliasesFile, aliases);
  }

  async updateAlias(alias, resourceAddress) {
    const aliases = await this.getAliases();
    if (aliases[alias]) {
      aliases[alias] = {
        ...aliases[alias],
        address: resourceAddress,
        updatedAt: new Date().toISOString(),
      };
      await this.writeFile(this.aliasesFile, aliases);
    }
  }

  /**
   * Resolve alias to full resource address
   * @param {string} aliasOrAddress - Alias name or full address
   * @returns {Promise<string>} Resolved address
   */
  async resolveAlias(aliasOrAddress) {
    const alias = await this.getAlias(aliasOrAddress);
    return alias ? alias.address : aliasOrAddress;
  }

  // Cleanup helper
  async cleanupRemoteData(remoteId) {
    // Remove contexts for this remote
    const contexts = await this.getContexts();
    const contextPrefix = `${remoteId}:`;
    for (const key in contexts) {
      if (key.startsWith(contextPrefix)) {
        delete contexts[key];
      }
    }
    await this.writeFile(this.contextsFile, contexts);

    // Remove workspaces for this remote
    const workspaces = await this.getWorkspaces();
    for (const key in workspaces) {
      if (key.startsWith(contextPrefix)) {
        delete workspaces[key];
      }
    }
    await this.writeFile(this.workspacesFile, workspaces);
  }
}

// Create singleton instance
const remoteStore = new RemoteStore();

export default config;
export {
  MACHINE_ID,
  APP_ID,
  CLI_CONFIG_DIR,
  CLIENT_CONTEXT_ARRAY,
  EXIT_CODES,
  remoteStore,
  REMOTES_FILE,
  CONTEXTS_FILE,
  WORKSPACES_FILE,
  ALIASES_FILE,
  SESSION_CLI_FILE,
};

/**
 * Utils
 */

function generateClientContextArray() {
  const networkCidr = getNetworkCidr();

  return [
    `client/app/${APP_ID}`,
    `client/device/${MACHINE_ID}`,
    `client/os/platform/${os.platform()}`,
    `client/os/arch/${os.machine()}`,
    `client/os/hostname/${os.hostname()}`,
    `client/os/user/${os.userInfo().username}`,
    `client/network/cidr/${networkCidr}`,
    `client/ephemeral/timezone/${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `client/ephemeral/datetime/${new Date().toISOString()}`,
  ];
}

function getNetworkCidr() {
  return (
    Object.values(os.networkInterfaces())
      .flat()
      .find(({ family, internal }) => family === "IPv4" && !internal)?.cidr ||
    "unknown"
  );
}

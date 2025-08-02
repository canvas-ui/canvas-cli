"use strict";

import chalk from "chalk";
import BaseCommand from "./base.js";

/**
 * Config command
 */
export class ConfigCommand extends BaseCommand {
  constructor(config) {
    super(config);
    this.options = null;
  }

  async execute(parsed) {
    this.options = parsed.options;

    // Collect client context for this execution
    this.collectClientContext();

    // Skip connection check for config commands
    return this.handleAction(parsed);
  }

  async handleAction(parsed) {
    try {
      const action = parsed.args[0] || "show";
      const methodName = `handle${action.charAt(0).toUpperCase() + action.slice(1)}`;

      if (typeof this[methodName] === "function") {
        return await this[methodName](parsed);
      } else {
        console.error(chalk.red(`Unknown config action: ${action}`));
        this.showHelp();
        return 1;
      }
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      return 1;
    }
  }

  /**
   * Show current configuration
   */
  async handleShow(parsed) {
    const key = parsed.args[1];

    if (key) {
      // Show specific key
      const value = this.config.get(key);
      if (value === undefined) {
        console.log(chalk.yellow(`Configuration key '${key}' not found`));
        return 1;
      }
      console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
    } else {
      // Show all configuration
      const allConfig = this.config.store;
      console.log(chalk.bold("Current Configuration:"));
      console.log(JSON.stringify(allConfig, null, 2));
    }

    console.log();
    console.log(chalk.gray(`Config file: ${this.config.path}`));
    return 0;
  }

  /**
   * Set configuration value
   */
  async handleSet(parsed) {
    const key = parsed.args[1];
    const value = parsed.args[2];

    if (!key) {
      throw new Error("Configuration key is required");
    }

    if (value === undefined) {
      throw new Error("Configuration value is required");
    }

    // Try to parse value as JSON, fallback to string
    let parsedValue;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }

    this.config.set(key, parsedValue);
    console.log(
      chalk.green(
        `✓ Configuration updated: ${key} = ${JSON.stringify(parsedValue)}`,
      ),
    );
    return 0;
  }

  /**
   * Get configuration value
   */
  async handleGet(parsed) {
    const key = parsed.args[1];

    if (!key) {
      throw new Error("Configuration key is required");
    }

    const value = this.config.get(key);
    if (value === undefined) {
      console.log(chalk.yellow(`Configuration key '${key}' not found`));
      return 1;
    }

    if (parsed.options.raw) {
      console.log(JSON.stringify(value));
    } else {
      console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
    }

    return 0;
  }

  /**
   * Delete configuration key
   */
  async handleDelete(parsed) {
    const key = parsed.args[1];

    if (!key) {
      throw new Error("Configuration key is required");
    }

    if (!this.config.has(key)) {
      console.log(chalk.yellow(`Configuration key '${key}' not found`));
      return 1;
    }

    if (!parsed.options.force) {
      console.log(
        chalk.yellow(`Warning: This will delete configuration key '${key}'.`),
      );
      console.log(chalk.yellow("Use --force to confirm deletion."));
      return 1;
    }

    this.config.delete(key);
    console.log(chalk.green(`✓ Configuration key '${key}' deleted`));
    return 0;
  }

  /**
   * Reset configuration to defaults
   */
  async handleReset(parsed) {
    if (!parsed.options.force) {
      console.log(
        chalk.yellow("Warning: This will reset all configuration to defaults."),
      );
      console.log(chalk.yellow("Use --force to confirm reset."));
      return 1;
    }

    this.config.clear();
    console.log(chalk.green("✓ Configuration reset to defaults"));
    return 0;
  }

  /**
   * List all configuration keys
   */
  async handleList(parsed) {
    const allConfig = this.config.store;
    const keys = this.flattenKeys(allConfig);

    if (keys.length === 0) {
      console.log(chalk.yellow("No configuration keys found"));
      return 0;
    }

    console.log(chalk.bold("Configuration Keys:"));
    keys.forEach((key) => {
      const value = this.config.get(key);
      const type = Array.isArray(value) ? "array" : typeof value;
      console.log(`  ${chalk.cyan(key)} ${chalk.gray(`(${type})`)}`);
    });

    return 0;
  }

  /**
   * Edit configuration file
   */
  async handleEdit(parsed) {
    const editor = process.env.EDITOR || "nano";
    const configPath = this.config.path;

    console.log(chalk.cyan(`Opening config file in ${editor}...`));
    console.log(chalk.gray(`Config file: ${configPath}`));

    try {
      const { spawn } = await import("child_process");
      const child = spawn(editor, [configPath], { stdio: "inherit" });

      return new Promise((resolve) => {
        child.on("close", (code) => {
          if (code === 0) {
            console.log(chalk.green("✓ Configuration file saved"));
            resolve(0);
          } else {
            console.log(chalk.red("✗ Editor exited with error"));
            resolve(1);
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to open editor: ${error.message}`);
    }
  }

  /**
   * Show configuration file path
   */
  async handlePath(parsed) {
    console.log(this.config.path);
    return 0;
  }

  /**
   * Validate configuration
   */
  async handleValidate(parsed) {
    const config = this.config.store;
    const errors = [];

    // Validate server configuration
    if (!config.server?.url) {
      errors.push("server.url is required");
    } else {
      try {
        new URL(config.server.url);
      } catch {
        errors.push("server.url must be a valid URL");
      }
    }

    // Validate auth configuration
    if (
      config.server?.auth?.type &&
      !["token", "jwt"].includes(config.server.auth.type)
    ) {
      errors.push('server.auth.type must be "token" or "jwt"');
    }

    // Validate connectors
    if (config.connectors?.ollama?.host) {
      try {
        new URL(config.connectors.ollama.host);
      } catch {
        errors.push("connectors.ollama.host must be a valid URL");
      }
    }

    if (errors.length === 0) {
      console.log(chalk.green("✓ Configuration is valid"));
      return 0;
    } else {
      console.log(chalk.red("✗ Configuration has errors:"));
      errors.forEach((error) => console.log(`  - ${error}`));
      return 1;
    }
  }

  /**
   * Flatten nested object keys
   */
  flattenKeys(obj, prefix = "") {
    const keys = [];
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (
        typeof obj[key] === "object" &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        keys.push(...this.flattenKeys(obj[key], fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    return keys;
  }

  /**
   * Show client context (for debugging)
   */
  async handleContext(parsed) {
    console.log(chalk.bold("Client Context Information:"));
    console.log();

    console.log(chalk.cyan("Full Context:"));
    console.log(JSON.stringify(this.currentContext, null, 2));
    console.log();

    console.log(chalk.cyan("Feature Array:"));
    this.featureArray.forEach((feature, index) => {
      console.log(`  ${index + 1}. ${feature}`);
    });
    console.log();

    console.log(chalk.cyan("LLM Context:"));
    console.log(JSON.stringify(this.llmContext, null, 2));
    console.log();

    console.log(chalk.cyan("API Headers:"));
    console.log(JSON.stringify(this.apiHeaders, null, 2));

    return 0;
  }

  /**
   * Show help
   */
  showHelp() {
    console.log(chalk.bold("Config Commands:"));
    console.log(
      "  show [key]            Show configuration (all or specific key)",
    );
    console.log("  get <key>             Get configuration value");
    console.log("  set <key> <value>     Set configuration value");
    console.log("  delete <key>          Delete configuration key");
    console.log("  list                  List all configuration keys");
    console.log("  reset                 Reset configuration to defaults");
    console.log("  edit                  Edit configuration file");
    console.log("  path                  Show configuration file path");
    console.log("  validate              Validate configuration");
    console.log("  context               Show client context (debug)");
    console.log();
    console.log(chalk.bold("Options:"));
    console.log("  --raw                 Output raw JSON (for get command)");
    console.log("  --force               Force action without confirmation");
    console.log();
    console.log(chalk.bold("Examples:"));
    console.log("  canvas config show");
    console.log("  canvas config get server.url");
    console.log("  canvas config set server.url http://localhost:8001/rest/v2");
    console.log("  canvas config set session.workspace my-workspace");
    console.log("  canvas config delete server.auth.token --force");
    console.log("  canvas config list");
    console.log("  canvas config validate");
    console.log("  canvas config context");
    console.log();
    console.log(chalk.bold("Common Configuration Keys:"));
    console.log("  server.url                    Canvas server URL");
    console.log("  server.auth.token             API token");
    console.log("  server.auth.type              Auth type (token/jwt)");
    console.log("  session.workspace             Current workspace");
    console.log("  session.context.id            Current context");
    console.log("  connectors.ollama.host        Ollama server URL");
    console.log("  connectors.ollama.model       Default Ollama model");
  }
}

export default ConfigCommand;

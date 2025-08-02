"use strict";

import chalk from "chalk";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import BaseCommand from "./base.js";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Server command for managing local Canvas server
 */
export class ServerCommand extends BaseCommand {
  constructor(config) {
    super(config);
    this.options = null;
    this.serverRoot = this.findServerRoot();
    this.serverScript = this.serverRoot
      ? path.join(this.serverRoot, "src/Server.js")
      : null;
    this.pm2AppName = "canvas-server";
  }

  /**
   * Find the Canvas server root directory
   */
  findServerRoot() {
    // 1. Check CANVAS_SERVER_ROOT environment variable
    if (process.env.CANVAS_SERVER_ROOT) {
      const envRoot = path.resolve(process.env.CANVAS_SERVER_ROOT);
      if (this.isValidServerRoot(envRoot)) {
        return envRoot;
      }
    }

    // 2. Check if we're in the canvas-server repo (current structure)
    const currentRepoRoot = path.resolve(__dirname, "../../../../..");
    if (this.isValidServerRoot(currentRepoRoot)) {
      return currentRepoRoot;
    }

    // 3. Check for ./server directory (standalone CLI with server submodule)
    const cliRoot = path.resolve(__dirname, "../../..");
    const serverSubmodule = path.join(cliRoot, "server");
    if (this.isValidServerRoot(serverSubmodule)) {
      return serverSubmodule;
    }

    return null;
  }

  /**
   * Check if a directory is a valid Canvas server root
   */
  isValidServerRoot(dir) {
    try {
      const packageJsonPath = path.join(dir, "package.json");
      const srcServerPath = path.join(dir, "src/Server.js");

      if (!fs.existsSync(packageJsonPath) || !fs.existsSync(srcServerPath)) {
        return false;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      return (
        packageJson.name === "canvas-server" ||
        packageJson.name === "@canvas/server"
      );
    } catch (error) {
      return false;
    }
  }

  async execute(parsed) {
    this.options = parsed.options;
    return super.execute(parsed);
  }

  /**
   * Check if Canvas server is available
   */
  checkServerAvailability() {
    if (!this.serverRoot) {
      console.error(chalk.red("Canvas server not found!"));
      console.log();
      console.log(
        chalk.yellow(
          "To use server management, you need the Canvas server code.",
        ),
      );
      console.log();
      console.log(
        chalk.bold("Option 1: Set CANVAS_SERVER_ROOT environment variable"),
      );
      console.log("  export CANVAS_SERVER_ROOT=/path/to/canvas-server");
      console.log();
      console.log(
        chalk.bold("Option 2: Clone Canvas server into ./server directory"),
      );
      console.log(
        "  git clone https://github.com/canvas-ai/canvas-server ./server",
      );
      console.log("  cd ./server && npm run update-submodules");
      console.log("  npm install");
      console.log();
      console.log(chalk.bold("Option 3: Use standalone Canvas server"));
      console.log("  git clone https://github.com/canvas-ai/canvas-server");
      console.log("  cd canvas-server && npm install");
      console.log("  export CANVAS_SERVER_ROOT=$(pwd)");
      return false;
    }

    if (!this.serverScript || !fs.existsSync(this.serverScript)) {
      console.error(
        chalk.red(`Canvas server script not found: ${this.serverScript}`),
      );
      console.log(
        chalk.yellow("Please ensure the server is properly installed."),
      );
      return false;
    }

    return true;
  }

  /**
   * Check if PM2 is installed
   */
  async checkPM2() {
    try {
      await execAsync("pm2 --version");
      return true;
    } catch (error) {
      console.error(chalk.red("PM2 is not installed. Install it with:"));
      console.error(chalk.yellow("npm install -g pm2"));
      return false;
    }
  }

  /**
   * Get PM2 process info
   */
  async getPM2ProcessInfo() {
    try {
      const { stdout } = await execAsync(`pm2 jlist`);
      const processes = JSON.parse(stdout);
      return processes.find((proc) => proc.name === this.pm2AppName);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if server is running locally
   */
  async isServerRunning() {
    try {
      const response = await this.apiClient.ping();
      return response && response.payload;
    } catch (error) {
      return false;
    }
  }

  /**
   * Start the Canvas server
   */
  async handleStart(parsed) {
    if (!this.checkServerAvailability()) {
      return 1;
    }

    if (!(await this.checkPM2())) {
      return 1;
    }

    try {
      // Check if already running
      const processInfo = await this.getPM2ProcessInfo();
      if (processInfo && processInfo.pm2_env.status === "online") {
        console.log(chalk.yellow("Canvas server is already running"));
        await this.showStatus();
        return 0;
      }

      console.log(chalk.blue("Starting Canvas server..."));

      // PM2 ecosystem config
      const pm2Config = {
        name: this.pm2AppName,
        script: this.serverScript,
        cwd: this.serverRoot,
        env: {
          NODE_ENV: "development",
          LOG_LEVEL: "info",
          CANVAS_API_PORT: "8001",
          CANVAS_WEB_PORT: "8001",
          ...process.env,
        },
        log_file: path.join(this.serverRoot, "logs/canvas-server.log"),
        error_file: path.join(this.serverRoot, "logs/canvas-server-error.log"),
        out_file: path.join(this.serverRoot, "logs/canvas-server-out.log"),
        time: true,
        autorestart: true,
        max_restarts: 5,
        min_uptime: "10s",
      };

      // Start with PM2
      await execAsync(
        `pm2 start '${JSON.stringify(pm2Config).replace(/'/g, "\\'")}'`,
      );

      console.log(chalk.green("✓ Canvas server started successfully"));

      // Wait a moment for startup
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Show status
      await this.showStatus();

      return 0;
    } catch (error) {
      console.error(chalk.red("Failed to start server:"), error.message);
      return 1;
    }
  }

  /**
   * Stop the Canvas server
   */
  async handleStop(parsed) {
    if (!this.checkServerAvailability()) {
      return 1;
    }

    if (!(await this.checkPM2())) {
      return 1;
    }

    try {
      const processInfo = await this.getPM2ProcessInfo();
      if (!processInfo) {
        console.log(chalk.yellow("Canvas server is not running"));
        return 0;
      }

      console.log(chalk.blue("Stopping Canvas server..."));
      await execAsync(`pm2 stop ${this.pm2AppName}`);
      await execAsync(`pm2 delete ${this.pm2AppName}`);

      console.log(chalk.green("✓ Canvas server stopped successfully"));
      return 0;
    } catch (error) {
      console.error(chalk.red("Failed to stop server:"), error.message);
      return 1;
    }
  }

  /**
   * Restart the Canvas server
   */
  async handleRestart(parsed) {
    if (!this.checkServerAvailability()) {
      return 1;
    }

    if (!(await this.checkPM2())) {
      return 1;
    }

    try {
      const processInfo = await this.getPM2ProcessInfo();
      if (!processInfo) {
        console.log(
          chalk.yellow("Canvas server is not running, starting it..."),
        );
        return await this.handleStart(parsed);
      }

      console.log(chalk.blue("Restarting Canvas server..."));
      await execAsync(`pm2 restart ${this.pm2AppName}`);

      console.log(chalk.green("✓ Canvas server restarted successfully"));

      // Wait a moment for restart
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Show status
      await this.showStatus();

      return 0;
    } catch (error) {
      console.error(chalk.red("Failed to restart server:"), error.message);
      return 1;
    }
  }

  /**
   * Show server status
   */
  async handleStatus(parsed) {
    await this.showStatus();
    return 0;
  }

  /**
   * Show server logs
   */
  async handleLogs(parsed) {
    if (!this.checkServerAvailability()) {
      return 1;
    }

    if (!(await this.checkPM2())) {
      return 1;
    }

    try {
      const processInfo = await this.getPM2ProcessInfo();
      if (!processInfo) {
        console.log(chalk.yellow("Canvas server is not running"));
        return 1;
      }

      console.log(
        chalk.blue("Showing Canvas server logs (press Ctrl+C to exit)..."),
      );
      console.log();

      // Stream logs using PM2
      const logsProcess = spawn(
        "pm2",
        ["logs", this.pm2AppName, "--lines", parsed.options.lines || "50"],
        {
          stdio: "inherit",
        },
      );

      // Handle process termination
      process.on("SIGINT", () => {
        logsProcess.kill("SIGINT");
        process.exit(0);
      });

      return new Promise((resolve) => {
        logsProcess.on("close", (code) => {
          resolve(code);
        });
      });
    } catch (error) {
      console.error(chalk.red("Failed to show logs:"), error.message);
      return 1;
    }
  }

  /**
   * Show comprehensive server status
   */
  async showStatus() {
    console.log(chalk.bold("Canvas Server Status:"));
    console.log();

    // Show server root info
    console.log("Server Configuration:");
    if (this.serverRoot) {
      console.log(`  Root: ${chalk.green(this.serverRoot)}`);
      console.log(`  Script: ${this.serverScript}`);
    } else {
      console.log(`  Root: ${chalk.red("not found")}`);
      console.log(
        `  Use CANVAS_SERVER_ROOT env var or clone server to ./server`,
      );
    }
    console.log();

    // Check PM2 process
    const processInfo = await this.getPM2ProcessInfo();
    if (processInfo) {
      const status = processInfo.pm2_env.status;
      const statusColor = status === "online" ? chalk.green : chalk.red;

      console.log("Local Process:");
      console.log(`  Status: ${statusColor(status)}`);
      console.log(`  PID: ${processInfo.pid || "N/A"}`);
      console.log(
        `  Uptime: ${this.formatUptime(processInfo.pm2_env.pm_uptime)}`,
      );
      console.log(`  Restarts: ${processInfo.pm2_env.restart_time}`);
      console.log(`  Memory: ${this.formatMemory(processInfo.monit.memory)}`);
      console.log(`  CPU: ${processInfo.monit.cpu}%`);
      console.log();
    } else {
      console.log("Local Process:");
      console.log(`  Status: ${chalk.red("stopped")}`);
      console.log();
    }

    // Check API connectivity
    const serverInfo = await this.isServerRunning();
    if (serverInfo) {
      console.log("API Server:");
      console.log(`  Status: ${chalk.green("online")}`);
      console.log(`  Version: ${serverInfo.version}`);
      console.log(`  Mode: ${serverInfo.serverMode}`);
      console.log(`  Environment: ${serverInfo.environment}`);
      console.log(
        `  Uptime: ${this.formatUptime(Date.now() - serverInfo.uptime * 1000)}`,
      );
      console.log(`  Hostname: ${serverInfo.hostname}`);
      console.log(`  URL: ${this.config.get("server.url")}`);
    } else {
      console.log("API Server:");
      console.log(`  Status: ${chalk.red("offline")}`);
      console.log(`  URL: ${this.config.get("server.url")}`);
    }
  }

  /**
   * Format uptime in human readable format
   */
  formatUptime(timestamp) {
    if (!timestamp) return "N/A";

    const uptime = Date.now() - timestamp;
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Format memory in human readable format
   */
  formatMemory(bytes) {
    if (!bytes) return "N/A";

    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
  }

  /**
   * Show help
   */
  showHelp() {
    console.log(chalk.bold("Server Commands:"));
    console.log("  start                 Start Canvas server locally");
    console.log("  stop                  Stop Canvas server");
    console.log("  restart               Restart Canvas server");
    console.log("  status                Show server status");
    console.log("  logs                  Show server logs");
    console.log();
    console.log(chalk.bold("Options:"));
    console.log(
      "  --lines <n>           Number of log lines to show (default: 50)",
    );
    console.log();
    console.log(chalk.bold("Examples:"));
    console.log("  canvas server start");
    console.log("  canvas server status");
    console.log("  canvas server logs --lines 100");
    console.log("  canvas server restart");
    console.log("  canvas server stop");
    console.log();
    console.log(chalk.cyan("Requirements:"));
    console.log("  • PM2 must be installed globally: npm install -g pm2");
    console.log("  • Canvas server code must be available locally");
    console.log("  • Server management only works for local instances");
    console.log(
      "  • Remote servers should be managed by their hosting platform",
    );
    console.log();
    console.log(chalk.cyan("Server Setup:"));
    console.log("  • Set CANVAS_SERVER_ROOT=/path/to/canvas-server, or");
    console.log(
      "  • Clone server: git clone https://github.com/canvas-ai/canvas-server ./server",
    );
    console.log("  • Install deps: cd ./server && npm install");
  }
}

export default ServerCommand;

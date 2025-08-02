"use strict";

import os from "os";
import pkg from "node-machine-id";
const { machineIdSync } = pkg;
import debugInstance from "debug";

const debug = debugInstance("canvas:cli:client-context");

/**
 * Client context collector for Canvas CLI
 * Collects system and environment information for LLM context and feature arrays
 */
export class ClientContextCollector {
  constructor() {
    this.machineId = machineIdSync(true);
    this.appId = "canvas-cli";
  }

  /**
   * Collect comprehensive client context
   */
  collect() {
    const context = {
      // Application context
      app: {
        id: this.appId,
        machineId: this.machineId,
      },

      // Operating system context
      os: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        release: os.release(),
        version: os.version(),
      },

      // User context
      user: this.getUserContext(),

      // Environment context
      environment: this.getEnvironmentContext(),

      // Runtime context
      runtime: {
        nodeVersion: process.version,
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },

      // Temporal context
      datetime: {
        iso: new Date().toISOString(),
        timestamp: Date.now(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    debug("Collected client context:", context);
    return context;
  }

  /**
   * Get user context information
   */
  getUserContext() {
    try {
      const userInfo = os.userInfo();
      return {
        name: userInfo.username,
        uid: userInfo.uid,
        gid: userInfo.gid,
        homedir: userInfo.homedir,
        shell: userInfo.shell || process.env.SHELL || "unknown",
      };
    } catch (error) {
      debug("Failed to get user context:", error.message);
      return {
        name: process.env.USER || process.env.USERNAME || "unknown",
        uid: null,
        gid: null,
        homedir: process.env.HOME || process.env.USERPROFILE || "unknown",
        shell: process.env.SHELL || "unknown",
      };
    }
  }

  /**
   * Get comprehensive environment context
   */
  getEnvironmentContext() {
    const platform = os.platform();
    const env = process.env;

    return {
      // Shell and terminal
      shell: this.getShellContext(),

      // Desktop and session
      desktop: this.getDesktopContext(),

      // Locale and language
      locale: this.getLocaleContext(),

      // Directories
      directories: this.getDirectoryContext(),

      // Display and graphics
      display: this.getDisplayContext(),

      // Working directory
      workingDir: {
        current: env.PWD || process.cwd(),
        previous: env.OLDPWD || null,
      },
    };
  }

  /**
   * Get shell context
   */
  getShellContext() {
    const env = process.env;
    return {
      shell: env.SHELL || env.ComSpec || "unknown",
      historySize: env.HISTSIZE || env.HISTFILESIZE || null,
      windowId: env.WINDOWID || null,
    };
  }

  /**
   * Get desktop session context
   */
  getDesktopContext() {
    const env = process.env;
    const platform = os.platform();

    if (platform === "linux" || platform === "freebsd") {
      return {
        session: env.DESKTOP_SESSION || null,
        sessionType: env.XDG_SESSION_TYPE || null,
        currentDesktop: env.XDG_CURRENT_DESKTOP || null,
        kdeSession: env.KDE_FULL_SESSION || null,
        gnomeSession: env.GNOME_DESKTOP_SESSION_ID || null,
        gdmSession: env.GDMSESSION || null,
      };
    } else if (platform === "darwin") {
      return {
        session: "aqua",
        sessionType: "gui",
        currentDesktop: "macOS",
      };
    } else if (platform === "win32") {
      return {
        session: env.SESSIONNAME || "Console",
        sessionType: "gui",
        currentDesktop: "Windows",
      };
    }

    return {};
  }

  /**
   * Get locale context
   */
  getLocaleContext() {
    const env = process.env;
    const platform = os.platform();

    if (
      platform === "linux" ||
      platform === "darwin" ||
      platform === "freebsd"
    ) {
      return {
        lang: env.LANG || null,
        lcAll: env.LC_ALL || null,
        lcAddress: env.LC_ADDRESS || null,
        lcCollate: env.LC_COLLATE || null,
        lcCtype: env.LC_CTYPE || null,
        lcIdentification: env.LC_IDENTIFICATION || null,
        lcMeasurement: env.LC_MEASUREMENT || null,
        lcMessages: env.LC_MESSAGES || null,
        lcMonetary: env.LC_MONETARY || null,
        lcName: env.LC_NAME || null,
        lcNumeric: env.LC_NUMERIC || null,
        lcPaper: env.LC_PAPER || null,
        lcTelephone: env.LC_TELEPHONE || null,
        lcTime: env.LC_TIME || null,
      };
    } else if (platform === "win32") {
      return {
        lang: env.LANG || null,
        // Windows uses different locale system
        userLocale: Intl.DateTimeFormat().resolvedOptions().locale,
      };
    }

    return {
      userLocale: Intl.DateTimeFormat().resolvedOptions().locale,
    };
  }

  /**
   * Get directory context
   */
  getDirectoryContext() {
    const env = process.env;
    const platform = os.platform();

    if (platform === "linux" || platform === "freebsd") {
      return {
        home: env.HOME || null,
        desktop: env.XDG_DESKTOP_DIR || null,
        downloads: env.XDG_DOWNLOAD_DIR || null,
        documents: env.XDG_DOCUMENTS_DIR || null,
        music: env.XDG_MUSIC_DIR || null,
        pictures: env.XDG_PICTURES_DIR || null,
        videos: env.XDG_VIDEOS_DIR || null,
        publicShare: env.XDG_PUBLICSHARE_DIR || null,
        templates: env.XDG_TEMPLATES_DIR || null,
        configHome: env.XDG_CONFIG_HOME || null,
        dataHome: env.XDG_DATA_HOME || null,
        cacheHome: env.XDG_CACHE_HOME || null,
      };
    } else if (platform === "darwin") {
      return {
        home: env.HOME || null,
        desktop: `${env.HOME}/Desktop`,
        downloads: `${env.HOME}/Downloads`,
        documents: `${env.HOME}/Documents`,
        music: `${env.HOME}/Music`,
        pictures: `${env.HOME}/Pictures`,
        videos: `${env.HOME}/Movies`,
      };
    } else if (platform === "win32") {
      return {
        home: env.USERPROFILE || null,
        desktop: `${env.USERPROFILE}\\Desktop`,
        downloads: `${env.USERPROFILE}\\Downloads`,
        documents: `${env.USERPROFILE}\\Documents`,
        music: `${env.USERPROFILE}\\Music`,
        pictures: `${env.USERPROFILE}\\Pictures`,
        videos: `${env.USERPROFILE}\\Videos`,
        appData: env.APPDATA || null,
        localAppData: env.LOCALAPPDATA || null,
        programFiles: env.PROGRAMFILES || null,
        programData: env.PROGRAMDATA || null,
      };
    }

    return {
      home: os.homedir(),
    };
  }

  /**
   * Get display context
   */
  getDisplayContext() {
    const env = process.env;
    const platform = os.platform();

    if (platform === "linux" || platform === "freebsd") {
      return {
        display: env.DISPLAY || null,
        waylandDisplay: env.WAYLAND_DISPLAY || null,
        xdgSessionType: env.XDG_SESSION_TYPE || null,
      };
    } else if (platform === "darwin") {
      return {
        display: env.DISPLAY || ":0", // macOS typically uses :0 when X11 is available
      };
    }

    return {};
  }

  /**
   * Generate feature array format for Canvas API
   * Returns array of strings in the format expected by Canvas
   */
  generateFeatureArray() {
    const context = this.collect();
    const features = [
      `client/app/id/${context.app.id}`,
      `client/device/id/${context.app.machineId}`,
      `client/os/platform/${context.os.platform}`,
      `client/os/architecture/${context.os.arch}`,
      `client/os/hostname/${context.os.hostname}`,
      `client/os/release/${context.os.release}`,
      `client/user/name/${context.user.name}`,
      `client/user/homedir/${context.user.homedir.replace(/\\/g, "/").replace(/^\//, "")}`,
      `client/user/shell/${context.user.shell.replace(/^\//, "")}`,
      `client/timestamp/${context.datetime.iso}`,
      `client/timezone/${context.datetime.timezone}`,
    ];

    // Add environment-specific features
    const env = context.environment;

    // Desktop features
    if (env.desktop.session)
      features.push(`client/desktop/session/${env.desktop.session}`);
    if (env.desktop.currentDesktop)
      features.push(`client/desktop/environment/${env.desktop.currentDesktop}`);
    if (env.desktop.sessionType)
      features.push(`client/desktop/type/${env.desktop.sessionType}`);

    // Locale features
    if (env.locale.lang) features.push(`client/locale/lang/${env.locale.lang}`);
    if (env.locale.lcAll)
      features.push(`client/locale/all/${env.locale.lcAll}`);

    // Directory features
    if (env.directories.desktop)
      features.push(
        `client/directories/desktop/${env.directories.desktop.replace(/\\/g, "/").replace(/^\//, "")}`,
      );
    if (env.directories.downloads)
      features.push(
        `client/directories/downloads/${env.directories.downloads.replace(/\\/g, "/").replace(/^\//, "")}`,
      );

    // Working directory features
    if (env.workingDir.current)
      features.push(
        `client/workdir/current/${env.workingDir.current.replace(/\\/g, "/").replace(/^\//, "")}`,
      );
    if (env.workingDir.previous)
      features.push(
        `client/workdir/previous/${env.workingDir.previous.replace(/\\/g, "/").replace(/^\//, "")}`,
      );

    // Display features
    if (env.display.display)
      features.push(`client/display/${env.display.display}`);

    return features;
  }

  /**
   * Generate context for LLM queries
   * Returns a structured object suitable for LLM context
   */
  generateLLMContext() {
    const context = this.collect();

    return {
      client: {
        application: context.app.id,
        machine_id: context.app.machineId,
        platform: context.os.platform,
        architecture: context.os.arch,
        hostname: context.os.hostname,
        user: context.user.name,
        home_directory: context.user.homedir,
        shell: context.user.shell,
        timezone: context.datetime.timezone,
        timestamp: context.datetime.iso,
      },
      system: {
        os_release: context.os.release,
        node_version: context.runtime.nodeVersion,
        process_uptime: context.runtime.uptime,
      },
      environment: {
        desktop_session: context.environment.desktop.session,
        desktop_environment: context.environment.desktop.currentDesktop,
        session_type: context.environment.desktop.sessionType,
        locale: context.environment.locale.lang,
        display: context.environment.display.display,
        working_directory: context.environment.workingDir.current,
        previous_working_directory: context.environment.workingDir.previous,
        directories: {
          desktop: context.environment.directories.desktop,
          downloads: context.environment.directories.downloads,
          documents: context.environment.directories.documents,
        },
      },
    };
  }

  /**
   * Get minimal context for API headers
   */
  getApiHeaders() {
    const context = this.collect();

    return {
      "X-Client-App": context.app.id,
      "X-Client-Platform": context.os.platform,
      "X-Client-Machine": context.app.machineId,
      "X-Client-User": context.user.name,
      "X-Client-Timezone": context.datetime.timezone,
      "X-Client-Timestamp": context.datetime.iso,
      "X-Client-Desktop":
        context.environment.desktop.currentDesktop || "unknown",
      "X-Client-Locale": context.environment.locale.lang || "unknown",
    };
  }
}

// Export singleton instance
export const clientContext = new ClientContextCollector();

export default clientContext;

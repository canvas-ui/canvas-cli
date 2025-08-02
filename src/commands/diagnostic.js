'use strict';

import chalk from 'chalk';
import os from 'os';
import BaseCommand from './base.js';
import {
    getPlatformInfo,
    needsWindowsCompat,
} from '../utils/windows-compat.js';

/**
 * Diagnostic command for troubleshooting platform issues
 */
export class DiagnosticCommand extends BaseCommand {
    constructor(config) {
        super(config);
        this.options = null;
    }

    async execute(parsed) {
        this.options = parsed.options;

        // Skip connection check for diagnostics
        const action = parsed.args[0] || 'platform';
        const methodName = `handle${action.charAt(0).toUpperCase() + action.slice(1)}`;

        if (typeof this[methodName] === 'function') {
            return await this[methodName](parsed);
        } else {
            console.error(chalk.red(`Unknown diagnostic action: ${action}`));
            this.showHelp();
            return 1;
        }
    }

    /**
   * Show platform information
   */
    async handlePlatform(parsed) {
        const platformInfo = getPlatformInfo();

        console.log(chalk.bold('Platform Diagnostic Information'));
        console.log('='.repeat(40));
        console.log();

        // Basic platform info
        console.log(chalk.cyan('System Information:'));
        console.log(`  Platform: ${platformInfo.platform}`);
        console.log(`  Architecture: ${platformInfo.arch}`);
        console.log(`  OS Release: ${platformInfo.release}`);
        console.log(`  Hostname: ${os.hostname()}`);
        console.log(`  User: ${os.userInfo().username}`);
        console.log(`  Home Directory: ${os.homedir()}`);
        console.log();

        // Runtime information
        console.log(chalk.cyan('Runtime Information:'));
        console.log(`  Node.js Version: ${platformInfo.nodeVersion}`);
        console.log(
            `  Is Bundled Executable: ${platformInfo.isBundled ? chalk.green('Yes') : chalk.yellow('No')}`,
        );
        console.log(
            `  Is Bun Runtime: ${platformInfo.isBun ? chalk.green('Yes') : chalk.yellow('No')}`,
        );
        console.log(`  Process PID: ${process.pid}`);
        console.log(`  Process Uptime: ${Math.floor(process.uptime())}s`);
        console.log();

        // Console capabilities
        console.log(chalk.cyan('Console Information:'));
        console.log(
            `  Has Console: ${platformInfo.hasConsole ? chalk.green('Yes') : chalk.red('No')}`,
        );
        console.log(
            `  Has Stdout: ${platformInfo.hasStdout ? chalk.green('Yes') : chalk.red('No')}`,
        );
        console.log(
            `  Stdout is TTY: ${platformInfo.stdoutIsTTY ? chalk.green('Yes') : chalk.yellow('No')}`,
        );
        console.log(`  Force Color: ${platformInfo.forceColor || 'Not Set'}`);
        console.log(
            `  Supports Color: ${chalk.supportsColor ? chalk.green('Yes') : chalk.red('No')}`,
        );
        console.log();

        // Environment variables
        console.log(chalk.cyan('Environment Variables:'));
        const envVars = [
            'PATH',
            'HOME',
            'USERPROFILE',
            'SHELL',
            'TERM',
            'COLORTERM',
            'FORCE_COLOR',
            'NO_COLOR',
            'DEBUG',
            'NODE_ENV',
        ];

        envVars.forEach((varName) => {
            const value = process.env[varName];
            if (value) {
                console.log(
                    `  ${varName}: ${value.length > 50 ? value.substring(0, 50) + '...' : value}`,
                );
            }
        });
        console.log();

        // Windows-specific information
        if (platformInfo.isWindows) {
            console.log(chalk.cyan('Windows-Specific Information:'));
            console.log(
                `  Needs Windows Compatibility: ${needsWindowsCompat() ? chalk.yellow('Yes') : chalk.green('No')}`,
            );
            console.log(`  Console Code Page: ${process.env.CHCP || 'Unknown'}`);
            console.log(
                `  Windows Terminal: ${process.env.WT_SESSION ? chalk.green('Yes') : chalk.yellow('No')}`,
            );
            console.log(
                `  PowerShell: ${process.env.PSModulePath ? chalk.green('Yes') : chalk.yellow('No')}`,
            );
            console.log();
        }

        // Memory usage
        const memUsage = process.memoryUsage();
        console.log(chalk.cyan('Memory Usage:'));
        console.log(`  RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
        console.log(
            `  Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        );
        console.log(
            `  Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        );
        console.log(`  External: ${Math.round(memUsage.external / 1024 / 1024)}MB`);
        console.log();

        return 0;
    }

    /**
   * Test console output capabilities
   */
    async handleConsole(parsed) {
        console.log(chalk.bold('Console Output Test'));
        console.log('='.repeat(30));
        console.log();

        // Basic text output
        console.log('✓ Basic text output works');

        // Color output test
        console.log('Color Test:');
        console.log(`  ${chalk.red('Red text')}`);
        console.log(`  ${chalk.green('Green text')}`);
        console.log(`  ${chalk.blue('Blue text')}`);
        console.log(`  ${chalk.yellow('Yellow text')}`);
        console.log(`  ${chalk.magenta('Magenta text')}`);
        console.log(`  ${chalk.cyan('Cyan text')}`);
        console.log();

        // Style test
        console.log('Style Test:');
        console.log(`  ${chalk.bold('Bold text')}`);
        console.log(`  ${chalk.italic('Italic text')}`);
        console.log(`  ${chalk.underline('Underlined text')}`);
        console.log(`  ${chalk.strikethrough('Strikethrough text')}`);
        console.log();

        // Background color test
        console.log('Background Test:');
        console.log(`  ${chalk.bgRed.white('Red background')}`);
        console.log(`  ${chalk.bgGreen.black('Green background')}`);
        console.log(`  ${chalk.bgBlue.white('Blue background')}`);
        console.log();

        // Unicode test
        console.log('Unicode Test:');
        console.log('  ✓ Checkmark');
        console.log('  ✗ Cross mark');
        console.log('  ● Bullet');
        console.log('  → Arrow');
        console.log('  ★ Star');
        console.log();

        // Error output test
        console.error(chalk.red('✓ Error output (stderr) works'));

        console.log(chalk.green('✓ All console tests completed'));

        return 0;
    }

    /**
   * Test configuration system
   */
    async handleConfig(parsed) {
        console.log(chalk.bold('Configuration System Test'));
        console.log('='.repeat(35));
        console.log();

        try {
            // Test config file location
            console.log(`Config file path: ${this.config.path}`);
            console.log(
                `Config file exists: ${this.config.size > 0 ? chalk.green('Yes') : chalk.yellow('No')}`,
            );
            console.log();

            // Test reading config
            const testKey = 'diagnostics.test';
            const testValue = `test-${Date.now()}`;

            console.log('Testing config operations:');

            // Write test
            this.config.set(testKey, testValue);
            console.log(`  ✓ Write test: Set ${testKey} = ${testValue}`);

            // Read test
            const readValue = this.config.get(testKey);
            if (readValue === testValue) {
                console.log(`  ✓ Read test: Got ${readValue}`);
            } else {
                console.log(`  ✗ Read test: Expected ${testValue}, got ${readValue}`);
            }

            // Delete test
            this.config.delete(testKey);
            const deletedValue = this.config.get(testKey);
            if (deletedValue === undefined) {
                console.log(`  ✓ Delete test: Key removed successfully`);
            } else {
                console.log(
                    `  ✗ Delete test: Key still exists with value ${deletedValue}`,
                );
            }

            console.log();
            console.log(chalk.green('✓ Configuration system test completed'));
        } catch (error) {
            console.log(
                chalk.red(`✗ Configuration system test failed: ${error.message}`),
            );
            return 1;
        }

        return 0;
    }

    /**
   * Show help
   */
    showHelp() {
        console.log(chalk.bold('Diagnostic Commands:'));
        console.log('  platform              Show platform information');
        console.log('  console               Test console output capabilities');
        console.log('  config                Test configuration system');
        console.log();
        console.log(chalk.bold('Examples:'));
        console.log('  canvas diagnostic platform');
        console.log('  canvas diagnostic console');
        console.log('  canvas diagnostic config');
        console.log();
        console.log(
            chalk.cyan(
                'Use these commands to troubleshoot platform-specific issues.',
            ),
        );
    }
}

export default DiagnosticCommand;

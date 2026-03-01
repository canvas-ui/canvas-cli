'use strict';

import chalk from 'chalk';
import BaseCommand from './base.js';

export class ConfigCommand extends BaseCommand {
    get needsConnection() { return false; }
    get defaultAction() { return 'show'; }

    async handleShow(parsed) {
        const key = parsed.args[1];
        if (key) {
            const value = this.config.get(key);
            if (value === undefined) {
                console.log(chalk.yellow(`Key '${key}' not found`));
                return 1;
            }
            console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
        } else {
            console.log(chalk.bold('Configuration:'));
            console.log(JSON.stringify(this.config.store, null, 2));
        }
        console.log();
        console.log(chalk.gray(`Config file: ${this.config.path}`));
        return 0;
    }

    async handleSet(parsed) {
        const key = parsed.args[1];
        const value = parsed.args[2];
        if (!key) throw new Error('Key is required');
        if (value === undefined) throw new Error('Value is required');

        let parsedValue;
        try { parsedValue = JSON.parse(value); }
        catch { parsedValue = value; }

        this.config.set(key, parsedValue);
        console.log(chalk.green(`${key} = ${JSON.stringify(parsedValue)}`));
        return 0;
    }

    async handleGet(parsed) {
        const key = parsed.args[1];
        if (!key) throw new Error('Key is required');

        const value = this.config.get(key);
        if (value === undefined) {
            console.log(chalk.yellow(`Key '${key}' not found`));
            return 1;
        }
        console.log(parsed.options.raw ? JSON.stringify(value) : `${key}: ${JSON.stringify(value, null, 2)}`);
        return 0;
    }

    async handleDelete(parsed) {
        const key = parsed.args[1];
        if (!key) throw new Error('Key is required');
        if (!this.config.has(key)) { console.log(chalk.yellow(`Key '${key}' not found`)); return 1; }
        if (!parsed.options.force) {
            console.log(chalk.yellow(`Will delete '${key}'. Use --force to confirm.`));
            return 1;
        }
        this.config.delete(key);
        console.log(chalk.green(`Deleted '${key}'`));
        return 0;
    }

    async handleReset(parsed) {
        if (!parsed.options.force) {
            console.log(chalk.yellow('Will reset all config to defaults. Use --force to confirm.'));
            return 1;
        }
        this.config.clear();
        console.log(chalk.green('Configuration reset to defaults'));
        return 0;
    }

    async handleList() {
        const keys = this._flattenKeys(this.config.store);
        if (keys.length === 0) { console.log(chalk.yellow('No keys')); return 0; }
        console.log(chalk.bold('Configuration Keys:'));
        for (const key of keys) {
            const value = this.config.get(key);
            console.log(`  ${chalk.cyan(key)} ${chalk.gray(`(${Array.isArray(value) ? 'array' : typeof value})`)}`);
        }
        return 0;
    }

    async handleEdit() {
        const editor = process.env.EDITOR || 'nano';
        const { spawn } = await import('child_process');
        const child = spawn(editor, [this.config.path], { stdio: 'inherit' });
        return new Promise((resolve) => child.on('close', (code) => resolve(code === 0 ? 0 : 1)));
    }

    async handlePath() {
        console.log(this.config.path);
        return 0;
    }

    async handleValidate() {
        const cfg = this.config.store;
        const errors = [];
        if (cfg.server?.url) {
            try { new URL(cfg.server.url); } catch { errors.push('server.url is not a valid URL'); }
        }
        if (cfg.server?.auth?.type && !['token', 'jwt'].includes(cfg.server.auth.type)) {
            errors.push('server.auth.type must be "token" or "jwt"');
        }
        if (errors.length === 0) {
            console.log(chalk.green('Configuration is valid'));
            return 0;
        }
        console.log(chalk.red('Configuration errors:'));
        errors.forEach((e) => console.log(`  - ${e}`));
        return 1;
    }

    _flattenKeys(obj, prefix = '') {
        const keys = [];
        for (const key in obj) {
            const full = prefix ? `${prefix}.${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                keys.push(...this._flattenKeys(obj[key], full));
            } else {
                keys.push(full);
            }
        }
        return keys;
    }

    showHelp() {
        console.log(chalk.bold('Config Commands:'));
        console.log('  show [key]            Show config (all or specific key)');
        console.log('  get <key>             Get value');
        console.log('  set <key> <value>     Set value');
        console.log('  delete <key>          Delete key');
        console.log('  list                  List all keys');
        console.log('  reset                 Reset to defaults');
        console.log('  edit                  Open in $EDITOR');
        console.log('  path                  Show config file path');
        console.log('  validate              Validate configuration');
    }
}

export default ConfigCommand;

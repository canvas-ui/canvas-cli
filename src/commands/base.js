'use strict';

import chalk from 'chalk';
import { CanvasClient } from '../client.js';
import { createFormatter } from '../utils/formatters.js';
import config from '../utils/config.js';
import debug from 'debug';

const log = debug('canvas:cli:command');

export class BaseCommand {
    constructor() {
        this.config = config;
        this.client = new CanvasClient();
        this.debug = log;
        this.options = {};
    }

    // ── Subclass config ──

    get needsConnection() { return true; }
    get skipConnectionFor() { return []; }
    get defaultAction() { return 'list'; }

    // ── Execute ──

    async execute(parsed) {
        try {
            this.options = parsed.options || {};

            const action = parsed.args[0] || this.defaultAction;
            const methodName = this._methodFor(action);

            if (typeof this[methodName] !== 'function') {
                console.error(chalk.red(`Unknown action: ${action}`));
                if (typeof this.showHelp === 'function') this.showHelp();
                return 1;
            }

            if (this.needsConnection && !this.skipConnectionFor.includes(action)) {
                await this.client.ping();
            }

            return await this[methodName](parsed);
        } catch (error) {
            console.error(chalk.red('Error:'), error.message);
            if (process.env.DEBUG) console.error(error.stack);
            return 1;
        }
    }

    _methodFor(action) {
        const camel = action.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return `handle${camel.charAt(0).toUpperCase() + camel.slice(1)}`;
    }

    // ── Output ──

    async output(data, type = 'generic', schema = null) {
        const formatter = createFormatter(type, {
            raw: this.options?.raw || false,
            format: this.options?.format || 'table',
        });

        let session = null;
        if (['remote', 'workspace', 'context'].includes(type)) {
            try { session = await this.client.store.getSession(); }
            catch { /* ignore */ }
        }

        console.log(
            schema ? formatter.format(data, session, schema) : formatter.format(data, session),
        );
    }

    // ── Context resolution ──

    async getCurrentContext(options = {}) {
        if (options.context) {
            return this._resolveContextAddress(options.context);
        }

        const session = await this.client.store.getSession();
        if (session.boundContext) {
            return this._resolveContextAddress(session.boundContext);
        }

        const remote = await this.client.currentRemote();
        return `${remote}:default`;
    }

    async _resolveContextAddress(address) {
        let resolved = await this.client.store.resolveAlias(address);
        if (!resolved.includes(':')) {
            const remote = await this.client.currentRemote();
            resolved = `${remote}:${resolved}`;
        }
        return resolved;
    }

    // ── Tree display (shared between workspace/context) ──

    displayTree(node, prefix = '', isLast = true) {
        if (!node) return;

        const connector = isLast ? '└── ' : '├── ';
        const name = node.label || node.name || node.id;
        const badge = node.type === 'universe' ? chalk.cyan('[UNIVERSE]') : '';
        const dot = node.color ? chalk.hex(node.color)('●') : '';

        console.log(`${prefix}${connector}${name} ${badge} ${dot}`);

        if (node.description && node.description !== 'Canvas layer') {
            console.log(`${prefix}${isLast ? '    ' : '│   '}${chalk.gray(node.description)}`);
        }

        if (Array.isArray(node.children)) {
            const childPfx = prefix + (isLast ? '    ' : '│   ');
            node.children.forEach((child, i) => {
                this.displayTree(child, childPfx, i === node.children.length - 1);
            });
        }
    }

    extractPaths(node, current = '') {
        const paths = [];
        if (!node) return paths;

        const name = node.label || node.name || node.id;
        let p = current;
        if (name && name !== '/' && name !== '' && node.type !== 'universe') {
            p = current === '' ? `/${name}` : `${current}/${name}`;
        }
        if (p && p !== '/' && node.type !== 'universe') paths.push(p);

        if (Array.isArray(node.children)) {
            for (const child of node.children) paths.push(...this.extractPaths(child, p));
        }
        return paths;
    }
}

export default BaseCommand;

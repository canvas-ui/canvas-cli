'use strict';

import chalk from 'chalk';
import BaseCommand from './base.js';

/**
 * Canvas server agents (REST /agents).
 */
export class AgentCommand extends BaseCommand {
    get defaultAction() { return 'list'; }

    async handleList() {
        const api = await this.client.api();
        const agents = await api.get('/agents');
        const rows = Array.isArray(agents) ? agents : [];
        if (!rows.length) {
            console.log(chalk.yellow('No agents returned'));
            return 0;
        }
        await this.output(rows, 'generic');
        return 0;
    }

    async handleShow(parsed) {
        const id = parsed.args[1];
        if (!id) throw new Error('Agent id or name required');
        const api = await this.client.api();
        const agent = await api.get(`/agents/${encodeURIComponent(id)}`);
        await this.output(agent, 'generic');
        return 0;
    }

    async handleStatus(parsed) {
        const id = parsed.args[1];
        if (!id) throw new Error('Agent id or name required');
        const api = await this.client.api();
        const st = await api.get(`/agents/${encodeURIComponent(id)}/status`);
        await this.output(st, 'generic');
        return 0;
    }

    async handlePrompt(parsed) {
        const id = parsed.args[1];
        const message = parsed.args.slice(2).join(' ').trim();
        if (!id) throw new Error('Agent id or name required');
        if (!message) throw new Error('Message required');
        const api = await this.client.api();
        const out = await api.post(`/agents/${encodeURIComponent(id)}/prompt`, { message });
        const messages = out?.messages || out;
        await this.output(messages, 'generic');
        return 0;
    }

    showHelp() {
        console.log(chalk.bold('Agent commands:'));
        console.log('  list                     List agents');
        console.log('  show <id|name>           Get agent');
        console.log('  status <id|name>        Lifecycle status');
        console.log('  prompt <id|name> <msg>  Send prompt (non-streaming)');
    }
}

export default AgentCommand;

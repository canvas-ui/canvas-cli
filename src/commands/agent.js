'use strict';

import chalk from 'chalk';
import BaseCommand from './base.js';
import { parseAgentAddress } from '../utils/address-parser.js';
import { AgentFormatter } from '../utils/formatters.js';

const SUBCOMMANDS = new Set([
    'list', 'show', 'get', 'create', 'update', 'delete',
    'start', 'stop', 'restart', 'status',
    'session', 'sessions',
    'prompt', 'skills', 'help',
]);

export class AgentCommand extends BaseCommand {
    get defaultAction() { return 'list'; }

    /**
     * If the first arg is not a known subcommand, treat it as "agentname[@remote] message..."
     */
    async execute(parsed) {
        const firstArg = parsed.args[0];
        if (firstArg && !SUBCOMMANDS.has(firstArg)) {
            return this._runPrompt(parsed, firstArg, parsed.args.slice(1));
        }
        return super.execute(parsed);
    }

    // ── Resolve agent specifier "name[@remote]" ──

    async _resolve(spec) {
        const addr = parseAgentAddress(spec);
        if (!addr) throw new Error(`Invalid agent specifier: ${spec}`);
        const remoteId = await this.client.resolveRemoteByShortname(addr.remote);
        const api = await this.client.api(remoteId);
        return { api, agentName: addr.agentName, remoteId };
    }

    // ── Core prompt ──

    async _runPrompt(parsed, spec, messageArgs) {
        const { api, agentName } = await this._resolve(spec);

        let message = messageArgs.join(' ').trim();

        // Stdin piped → prepend as context block
        if (parsed.data) {
            const q = message ? `\n\n${message}` : '';
            message = `<stdin>\n${parsed.data.trimEnd()}\n</stdin>${q}`;
        }

        if (!message) throw new Error('Message required');

        // Inject workspace/context metadata
        const meta = [];
        if (parsed.options.workspace) meta.push(`Workspace: ${parsed.options.workspace}`);
        if (parsed.options.context)   meta.push(`Context: ${parsed.options.context}`);
        if (meta.length) message = `[${meta.join(', ')}]\n\n${message}`;

        const out = await api.post(`/agents/${encodeURIComponent(agentName)}/prompt`, { message });
        this._printMessages(out?.messages || []);
        return 0;
    }

    // ── List ──

    async handleList() {
        const api = await this.client.api();
        const agents = await api.get('/agents');
        const rows = Array.isArray(agents) ? agents : [];
        await this.output(rows, 'agent');
        return 0;
    }

    // ── Show / Get ──

    async handleShow(parsed) {
        const spec = parsed.args[1];
        if (!spec) throw new Error('Agent name required');
        const { api, agentName } = await this._resolve(spec);
        const agent = await api.get(`/agents/${encodeURIComponent(agentName)}`);
        await this.output(agent, 'agent');
        return 0;
    }

    async handleGet(parsed) { return this.handleShow(parsed); }

    // ── Status ──

    async handleStatus(parsed) {
        const spec = parsed.args[1];
        if (!spec) throw new Error('Agent name required');
        const { api, agentName } = await this._resolve(spec);
        const st = await api.get(`/agents/${encodeURIComponent(agentName)}/status`);
        await this.output(st, 'generic');
        return 0;
    }

    // ── Create ──

    async handleCreate(parsed) {
        const name = parsed.args[1];
        if (!name) throw new Error('Agent name required');
        const { llmProvider, model, label, description, color, apiKey, baseUrl } = parsed.options;
        const api = await this.client.api();
        const agent = await api.post('/agents', {
            name,
            ...(label       !== undefined && { label }),
            ...(description !== undefined && { description }),
            ...(color       !== undefined && { color }),
            ...(llmProvider !== undefined && { llmProvider }),
            ...(model       !== undefined && { model }),
            ...(apiKey      !== undefined && { apiKey }),
            ...(baseUrl     !== undefined && { baseUrl }),
        });
        await this.output(agent, 'generic');
        return 0;
    }

    // ── Update ──

    async handleUpdate(parsed) {
        const spec = parsed.args[1];
        if (!spec) throw new Error('Agent name required');
        const { api, agentName } = await this._resolve(spec);
        const { llmProvider, model, label, description, color, apiKey, baseUrl } = parsed.options;
        const agent = await api.put(`/agents/${encodeURIComponent(agentName)}`, {
            ...(label       !== undefined && { label }),
            ...(description !== undefined && { description }),
            ...(color       !== undefined && { color }),
            ...(llmProvider !== undefined && { llmProvider }),
            ...(model       !== undefined && { model }),
            ...(apiKey      !== undefined && { apiKey }),
            ...(baseUrl     !== undefined && { baseUrl }),
        });
        await this.output(agent, 'generic');
        return 0;
    }

    // ── Delete ──

    async handleDelete(parsed) {
        const spec = parsed.args[1];
        if (!spec) throw new Error('Agent name required');
        if (!parsed.options.force) {
            console.log(chalk.yellow(`Delete '${spec}'? Use --force to confirm.`));
            return 1;
        }
        const { api, agentName } = await this._resolve(spec);
        await api.del(`/agents/${encodeURIComponent(agentName)}`);
        console.log(chalk.green(`Agent '${agentName}' deleted`));
        return 0;
    }

    // ── Lifecycle ──

    async handleStart(parsed) {
        const spec = parsed.args[1];
        if (!spec) throw new Error('Agent name required');
        const { api, agentName } = await this._resolve(spec);
        await api.post(`/agents/${encodeURIComponent(agentName)}/start`);
        console.log(chalk.green(`Agent '${agentName}' started`));
        return 0;
    }

    async handleStop(parsed) {
        const spec = parsed.args[1];
        if (!spec) throw new Error('Agent name required');
        const { api, agentName } = await this._resolve(spec);
        await api.post(`/agents/${encodeURIComponent(agentName)}/stop`);
        console.log(chalk.green(`Agent '${agentName}' stopped`));
        return 0;
    }

    async handleRestart(parsed) {
        const spec = parsed.args[1];
        if (!spec) throw new Error('Agent name required');
        const { api, agentName } = await this._resolve(spec);
        await api.post(`/agents/${encodeURIComponent(agentName)}/restart`);
        console.log(chalk.green(`Agent '${agentName}' restarted`));
        return 0;
    }

    // ── Sessions ──

    async handleSession(parsed) {
        const spec = parsed.args[1];
        if (!spec) throw new Error('Agent name required');
        const { api, agentName } = await this._resolve(spec);
        const session = await api.get(`/agents/${encodeURIComponent(agentName)}/session`);
        if (parsed.options.raw || parsed.options.format === 'json') {
            await this.output(session, 'agent');
        } else {
            const fmt = new AgentFormatter({ format: parsed.options.format });
            console.log(fmt.formatSessionContext(session));
        }
        return 0;
    }

    async handleSessions(parsed) {
        const spec = parsed.args[1];
        if (!spec) throw new Error('Agent name required');
        const { api, agentName } = await this._resolve(spec);
        const data = await api.get(`/agents/${encodeURIComponent(agentName)}/sessions`);
        if (parsed.options.raw || parsed.options.format === 'json') {
            await this.output(data, 'generic');
        } else {
            const fmt = new AgentFormatter({ format: parsed.options.format });
            console.log(fmt.formatSessionList(data));
        }
        return 0;
    }

    // ── Skills ──

    async handleSkills(parsed) {
        const spec = parsed.args[1];
        if (!spec) throw new Error('Agent name required');
        const { api, agentName } = await this._resolve(spec);
        const skills = await api.get(`/agents/${encodeURIComponent(agentName)}/skills`);
        const rows = Array.isArray(skills) ? skills : [];
        if (!rows.length) { console.log(chalk.yellow('No skills installed')); return 0; }
        await this.output(rows, 'generic');
        return 0;
    }

    // ── Explicit prompt subcommand ──

    async handlePrompt(parsed) {
        const spec = parsed.args[1];
        if (!spec) throw new Error('Agent name required');
        return this._runPrompt(parsed, spec, parsed.args.slice(2));
    }

    // ── Help ──

    async handleHelp() { this.showHelp(); return 0; }

    // ── Output helpers ──

    _printMessages(messages) {
        if (!Array.isArray(messages) || !messages.length) return;
        for (const msg of messages) {
            if (!Array.isArray(msg.content)) continue;
            for (const block of msg.content) {
                if (block.type === 'text') process.stdout.write(block.text);
            }
        }
        process.stdout.write('\n');
    }

    showHelp() {
        console.log(chalk.bold('Usage:'));
        console.log('  canvas agent <name[@remote]> [message]   Prompt agent');
        console.log('  canvas agent <subcommand> [args]         Manage agents');
        console.log('  hi <name[@remote]> [message]             Shorthand alias');
        console.log();
        console.log(chalk.bold('Agent addressing:'));
        console.log('  lucy              Agent on default remote');
        console.log('  lucy@home         Agent on remote "home" (matches *@home)');
        console.log('  lucy@admin@work   Agent on remote "admin@work" (exact match)');
        console.log();
        console.log(chalk.bold('Subcommands:'));
        console.log('  list                          List agents');
        console.log('  show <spec>                   Get agent details');
        console.log('  create <name>                 Create agent');
        console.log('  update <spec>                 Update agent');
        console.log('  delete <spec> --force         Delete agent');
        console.log('  start <spec>                  Start agent');
        console.log('  stop <spec>                   Stop agent');
        console.log('  restart <spec>                Restart agent');
        console.log('  status <spec>                 Lifecycle status');
        console.log('  session <spec>                Current session context');
        console.log('  sessions <spec>               List sessions');
        console.log('  skills <spec>                 List installed skills');
        console.log('  prompt <spec> <msg>           Explicit prompt');
        console.log();
        console.log(chalk.bold('Prompt options:'));
        console.log('  --workspace <name>   Prepend workspace to message');
        console.log('  --context <path>     Prepend context to message');
        console.log();
        console.log(chalk.bold('Examples:'));
        console.log("  canvas agent lucy \"what's the weather?\"");
        console.log('  canvas agent lucy@home "any new PRs?"');
        console.log('  hi linus "any idea what those ACPI errors are"');
        console.log('  tail -n500 /var/log/syslog | hi linus "any ACPI errors?"');
        console.log('  hi carmack@local "any new PRs to review?"');
    }
}

export default AgentCommand;

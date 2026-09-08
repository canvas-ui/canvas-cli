'use strict';

import { isTTY, spinner, yesNo } from '../../../core/prompt.js';
import { apply, plan } from '../lib.js';

export default {
    name: 'run',
    aliases: ['apply', 'all'],
    description: 'Check and apply updates: `canvas update [cli|packages|services|edge|server] [--check] [--to <version>] [--skip-restart] [--yes]`',
    positional: [{ name: 'target', required: false }],
    flags: { check: 'boolean', to: 'string', 'skip-restart': 'boolean', skipRestart: 'boolean' },
    async run({ args, flags, io }) {
        const s = spinner();
        s.start('Checking for updates…');
        let rows;
        try { rows = await plan({ target: args.target, to: flags.to || null }); } catch (err) { s.stop('Check failed'); throw err; }
        s.stop('Checked');
        io.output(rows.map(({ component, installed, latest, status }) => ({ component, installed, latest: latest || '-', status })), { columns: ['component', 'installed', 'latest', 'status'] });
        const pending = rows.filter((r) => r.pending);
        if (!pending.length) { io.success('Everything is up to date.'); return; }
        if (flags.check) { io.info(`${pending.length} update(s) available — \`canvas update\` applies them.`); return; }
        if (!flags.yes) {
            if (!isTTY()) { io.warn(`${pending.length} update(s) available; run \`canvas update --yes\` to apply non-interactively.`); return; }
            if (!(await yesNo(`Apply ${pending.length} update(s)?`, true))) { io.info('Nothing changed.'); return; }
        }
        const done = await apply(rows, { io, spinner, restart: !(flags['skip-restart'] || flags.skipRestart) });
        const cli = done.find((r) => r.kind === 'cli');
        io.success(`${done.length} update(s) applied.${cli ? ' The new canvas is used by your next command.' : ''}`);
    },
};

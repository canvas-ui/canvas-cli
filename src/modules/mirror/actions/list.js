'use strict';

import { listMirrors } from '../lib/config.js';
import { statusAll } from '../lib/fuse.js';

export default {
    name: 'list',
    aliases: ['ls'],
    description: 'Mirrors configured on this device',
    async run({ io }) {
        const mirrors = listMirrors();
        if (mirrors.length === 0) { io.info('No mirrors. Run `canvas mirror init`.'); return; }
        const running = await statusAll().catch(() => []);
        const byMount = new Map(running.map((m) => [m.mountpoint, m]));
        io.output(mirrors.map((m) => {
            const st = byMount.get(m.mountpoint);
            return {
                id: m.id,
                workspace: m.workspaceName,
                hub: m.remote,
                client: m.client || 'fuse',
                mountpoint: m.mountpoint,
                pins: (m.pins || []).join(', ') || '(on demand)',
                conflicts: m.conflicts,
                managed: m.managed,
                mount: st ? (st.status || 'ok') : 'not running',
                state: st?.mirror?.state || '-',
            };
        }), { columns: ['id', 'workspace', 'hub', 'client', 'mountpoint', 'pins', 'conflicts', 'managed', 'mount', 'state'] });
    },
};

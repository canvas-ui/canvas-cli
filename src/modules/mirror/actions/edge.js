'use strict';

import { UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { EDGE_PACKAGE, EDGE_PREFIX, edgeAvailable, edgeBinary, installEdge, installedEdge } from '../lib/edge.js';
import { listMirrors } from '../lib/config.js';
import { restartEdgeService } from '../lib/edge.js';

/*
 * `canvas remote mirror edge install|update|status` — the canvas-edge runtime the
 * daemon mirrors run on, fetched from the edge-dist branch into ~/.canvas/edge.
 */
export default {
    name: 'edge',
    description: 'canvas-edge runtime: `edge install | update | status`',
    positional: [{ name: 'op', required: false }],
    flags: { restart: 'boolean' },
    async run({ args, flags, io }) {
        const op = String(args.op || 'status');
        if (op === 'status') {
            const inst = installedEdge();
            io.output({
                binary: (await edgeAvailable()) ? edgeBinary() : '(not found)',
                prefix: EDGE_PREFIX,
                installed: inst ? `${inst.version}${inst.rev ? ` (main@${inst.rev})` : ''}` : '-',
                package: EDGE_PACKAGE,
            });
            return;
        }
        if (!['install', 'update'].includes(op)) throw new UsageError('op must be install | update | status');
        io.info(`${op === 'update' ? 'Updating' : 'Installing'} ${EDGE_PACKAGE} in ${EDGE_PREFIX}…`);
        const bin = await installEdge({ update: op === 'update' });
        const inst = installedEdge();
        io.success(`canvas-edge ${inst?.version || ''}${inst?.rev ? ` (main@${inst.rev})` : ''} → ${bin}`);
        if (flags.restart || op === 'update') {
            const daemon = listMirrors().filter((m) => m.client === 'daemon');
            if (daemon.length) {
                const managed = daemon.some((m) => m.managed === 'pm2') ? 'pm2' : 'manual';
                await restartEdgeService(io, { managed });
                io.success(`Restarted canvas-edge for ${daemon.length} folder(s)`);
            }
        }
    },
};

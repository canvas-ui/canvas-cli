'use strict';

import { distManifest } from './dist.js';
import { EDGE_PACKAGE, EDGE_PREFIX, installEdge, installedEdge, restartEdgeService } from './edge.js';
import { listMirrors } from './config.js';

/*
 * What `canvas update` sees from this package: the canvas-edge runtime in
 * ~/.canvas/edge. Installed = the prefix's package.json (version + the
 * canvasRev pack-dist stamped); latest = the same manifest on the edge-dist
 * branch; update = `npm update` in the prefix; restart = re-create the pm2
 * process (or respawn the detached daemon) when daemon mirrors exist.
 */
export const edgeService = {
    id: 'edge',
    label: 'canvas-edge',
    description: `folder-sync daemon (${EDGE_PACKAGE} → ${EDGE_PREFIX})`,
    async installed() {
        const inst = installedEdge();
        return inst ? { version: inst.version, rev: inst.rev, dir: inst.dir } : null;
    },
    async latest() {
        const m = /#([\w./-]+)$/.exec(EDGE_PACKAGE);
        if (!m || !EDGE_PACKAGE.startsWith('github:')) return null;   // a fork / tag / npm name: no cheap check
        return distManifest(EDGE_PACKAGE.slice('github:'.length, m.index), m[1]);
    },
    async update({ onStep } = {}) {
        onStep?.(`npm update in ${EDGE_PREFIX}…`);
        const before = installedEdge();
        await installEdge({ update: true });
        const after = installedEdge();
        return { before: before ? `${before.version}${before.rev ? ` (${before.rev})` : ''}` : null, after: after ? `${after.version}${after.rev ? ` (${after.rev})` : ''}` : null };
    },
    async restart({ io } = {}) {
        const daemon = listMirrors().filter((m) => m.client === 'daemon');
        if (!daemon.length) return { skipped: 'no daemon mirrors, nothing to restart' };
        const managed = daemon.some((m) => m.managed === 'pm2') ? 'pm2' : 'manual';
        await restartEdgeService(io, { managed });
        return { restarted: true };
    },
};



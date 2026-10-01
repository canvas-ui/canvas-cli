'use strict';

import { CanvasError } from '@augmentd-labs/canvas-cli-host/errors';
import { EDGE_PACKAGE, EDGE_PKG_NAME, EDGE_PREFIX, EDGE_SPEC, installEdge, installedEdge, restartEdgeService } from './edge.js';
import { listMirrors } from './config.js';

/*
 * What `canvas update` sees from this package: the canvas-edge runtime in
 * ~/.canvas/edge. Installed = the prefix's package.json; latest = the npm
 * registry's version for the spec's dist-tag; update = `npm update` in the
 * prefix; restart = re-create the pm2
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
        if (!/^[a-z][\w.-]*$/i.test(EDGE_SPEC)) return null;   // a range / tarball / fork: no cheap check
        return { version: await npmDistTag(EDGE_PKG_NAME, EDGE_SPEC) };
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



/** Version behind a dist-tag (`latest`) on the npm registry. */
async function npmDistTag(name, tag) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 20_000);
    try {
        const res = await fetch(`https://registry.npmjs.org/-/package/${name}/dist-tags`, { signal: abort.signal });
        if (!res.ok) throw new CanvasError(`${name}: npm registry HTTP ${res.status}`);
        const tags = await res.json();
        if (!tags[tag]) throw new CanvasError(`${name}: no '${tag}' dist-tag on npm`);
        return tags[tag];
    } catch (err) {
        if (err instanceof CanvasError) throw err;
        throw new CanvasError(`${name}: ${abort.signal.aborted ? 'npm registry timed out' : err?.cause?.message || err.message}`);
    } finally {
        clearTimeout(timer);
    }
}

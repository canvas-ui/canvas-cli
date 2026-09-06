'use strict';

import { fuseAvailable, mount, unmount } from './fuse.js';
import { STARTUP_HINT, restartProcess, save, startProcess } from './pm2.js';
import { ensureEdgeService, restartEdgeService } from './edge.js';
import { upsertMirror } from './config.js';

/*
 * Start (or restart) a set of mirrors the way each one is configured:
 * daemon entries share one canvas-edge process, fuse entries get a mount
 * each — under pm2 when `managed === 'pm2'`, detached otherwise. Used by
 * `mirror init`, `mirror start` and `mirror restart` so they cannot drift.
 */
export async function startMirrors(mirrors, io, { restart = false } = {}) {
    const daemon = mirrors.filter((m) => m.client === 'daemon');
    const fuse = mirrors.filter((m) => m.client !== 'daemon');
    const results = [];

    if (daemon.length) {
        // `mirror stop` pauses daemon entries; starting them again lifts that before the daemon reloads.
        for (const m of daemon) if (m.paused) upsertMirror({ ...m, paused: false });
        const managed = daemon.some((m) => m.managed === 'pm2') ? 'pm2' : 'manual';
        try {
            const res = restart ? await restartEdgeService(io, { managed }) : await ensureEdgeService(io, { managed });
            const verb = res.restarted ? 'Restarted' : res.started ? 'Started' : 'Reloaded';
            io.success(`${verb} canvas-edge for ${daemon.length} folder(s)${managed === 'manual' ? ' (unsupervised)' : ''}`);
            results.push(...daemon.map((m) => ({ mirror: m, ok: true })));
        } catch (e) {
            io.error(`canvas-edge: ${e.message}`);
            results.push(...daemon.map((m) => ({ mirror: m, ok: false, error: e.message })));
        }
    }

    if (fuse.length) {
        if (!(await fuseAvailable())) {
            io.warn('canvas-fuse binary not found — FUSE mirrors are configured but not started. Install canvas-fuse (or set CANVAS_FUSE_BIN) and run `canvas mirror start all`.');
            results.push(...fuse.map((m) => ({ mirror: m, ok: false, error: 'canvas-fuse not found' })));
            return results;
        }
        let usedPM2 = false;
        for (const mirror of fuse) {
            try {
                if (mirror.managed === 'pm2') {
                    usedPM2 = true;
                    const { name, started } = restart ? await restartProcess(mirror) : await startProcess(mirror);
                    io.success(`${restart ? 'Restarted' : started ? 'Started' : 'Already running'}: ${name} → ${mirror.mountpoint}`);
                } else {
                    if (restart) await unmount(mirror.mountpoint).catch(() => null);
                    const res = await mount(mirror);
                    if (!res.ok) throw new Error(res.stderr.trim() || res.stdout.trim() || 'mount failed');
                    io.success(`${restart ? 'Remounted' : 'Mounted'} ${mirror.mountpoint}`);
                }
                results.push({ mirror, ok: true });
            } catch (e) {
                io.error(`${mirror.workspaceName}: ${e.message}`);
                results.push({ mirror, ok: false, error: e.message });
            }
        }
        if (usedPM2) {
            await save();
            io.info(STARTUP_HINT);
        }
    }
    return results;
}

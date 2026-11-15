'use strict';

import { CanvasError, UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { isTTY, yesNo } from '@augmentd-labs/canvas-cli-host/prompt';
import { fuseAvailable, isMounted, mount, mountError, setPaused as setMountPaused, unmount } from './fuse.js';
import { FUSE_INSTALL_PATH, fuseTarget, hasFusermount, installFuse } from './fuse-release.js';
import { STARTUP_HINT, restartProcess, save, startProcess } from './pm2.js';
import { ensureEdgeService, restartEdgeService } from './edge.js';
import { findMirror, listMirrors, upsertMirror } from './config.js';

/*
 * Start (or restart) a set of mirrors the way each one is configured:
 * daemon entries share one canvas-edge process, fuse entries get a mount
 * each — under pm2 when `managed === 'pm2'`, detached otherwise. Used by
 * `mirror init`, `mirror start` and `mirror restart` so they cannot drift.
 */
export async function startMirrors(mirrors, io, { restart = false } = {}) {
    // Everything canvas-edge runs: daemon folders and edge-supervised FUSE mounts (fuse units).
    const viaEdge = mirrors.filter((m) => m.client === 'daemon' || m.managed === 'edge');
    const fuse = mirrors.filter((m) => m.client !== 'daemon' && m.managed !== 'edge');
    const results = [];

    if (viaEdge.length) {
        // `mirror stop` pauses edge entries; starting them again lifts that before the daemon reloads.
        for (const m of viaEdge) if (m.paused) upsertMirror({ ...m, paused: false });
        // The daemon itself runs under pm2 when any daemon folder asked for it (`service install`).
        const managed = viaEdge.some((m) => m.client === 'daemon' && m.managed === 'pm2') ? 'pm2' : 'manual';
        const fuseUnits = viaEdge.filter((m) => m.client !== 'daemon').length;
        try {
            const res = restart ? await restartEdgeService(io, { managed }) : await ensureEdgeService(io, { managed });
            const verb = res.restarted ? 'Restarted' : res.started ? 'Started' : 'Reloaded';
            io.success(`${verb} canvas-edge for ${viaEdge.length - fuseUnits} folder(s)${fuseUnits ? ` + ${fuseUnits} fuse unit(s)` : ''}${managed === 'manual' ? ' (unsupervised)' : ''}`);
            results.push(...viaEdge.map((m) => ({ mirror: m, ok: true })));
        } catch (e) {
            io.error(`canvas-edge: ${e.message}`);
            results.push(...viaEdge.map((m) => ({ mirror: m, ok: false, error: e.message })));
        }
    }

    if (fuse.length) {
        if (!(await fuseAvailable())) {
            io.warn('canvas-fuse binary not found — FUSE mirrors are configured but not started. Install canvas-fuse (or set CANVAS_FUSE_BIN) and run `canvas remote mirror start all`.');
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
                    else if (await isMounted(mirror.mountpoint)) {
                        io.success(`Already mounted: ${mirror.mountpoint}`);
                        results.push({ mirror, ok: true });
                        continue;
                    }
                    const res = await mount(mirror);
                    if (!res.ok) throw new Error(mountError(res));
                    if (res.starting) io.info(`${mirror.mountpoint}: still preparing (scanning the folder) — \`canvas mirror status ${mirror.workspaceName}\` shows when it is up`);
                    else io.success(`${restart ? 'Remounted' : 'Mounted'} ${mirror.mountpoint}`);
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

/**
 * Make sure a canvas-fuse binary is there before a mount needs it. Missing:
 * offer the release build (`yes` skips the question; without a terminal the
 * answer is an error that says how).
 */
export async function ensureFuse(io, { yes = false } = {}) {
    if (await fuseAvailable()) return;
    if (!fuseTarget()) throw new CanvasError(`canvas-fuse has no build for ${process.platform}/${process.arch} (Linux x64 and arm64 only) — use \`canvas mirror add --client daemon\` here`);
    if (!yes) {
        if (!isTTY()) throw new CanvasError('canvas-fuse is not installed. Re-run with --yes to install it, or set CANVAS_FUSE_BIN.');
        if (!(await yesNo(`canvas-fuse is not installed. Download the latest release to ${FUSE_INSTALL_PATH}?`, true))) throw new CanvasError('canvas-fuse is required to mount a workspace');
    }
    const installed = await installFuse({ onStep: (m) => io.info(m) });
    io.success(`Installed canvas-fuse ${installed.version} → ${installed.path}`);
    if (!(await hasFusermount())) io.warn('fusermount3 is not on PATH — install your distribution\'s fuse3 package before mounting');
}

/** `mirror pause|resume [workspace]`: every mirror when none is named. */
export async function setPaused(ref, paused, io) {
    const targets = ref && ref !== 'all' ? [findMirror(ref)].filter(Boolean) : listMirrors();
    if (targets.length === 0) throw new UsageError(ref ? `No mirror for '${ref}'` : 'No mirrors configured');
    for (const mirror of targets) {
        if (mirror.client === 'daemon') {
            io.warn(`${mirror.workspaceName}: a canvas-edge folder has no pause — \`canvas mirror stop ${mirror.workspaceName}\` takes it out of sync`);
            continue;
        }
        const res = await setMountPaused(mirror.mountpoint, paused);
        if (res.ok) { io.success(`${mirror.workspaceName}: ${res.stdout.trim() || (paused ? 'sync paused' : 'sync resumed')}`); continue; }
        const reason = res.stderr.trim() || 'daemon not running';
        io.warn(`${mirror.workspaceName}: ${/unrecognized subcommand/.test(reason) ? 'this canvas-fuse cannot pause (needs 0.18.0 or newer) — `canvas update fuse`, then `canvas mirror restart`' : reason}`);
    }
}

/**
 * `mirror start|restart <workspace>` take a name only: where a mirror lives
 * is decided when it is set up. A stray path would otherwise be dropped and
 * the mirror started somewhere the user did not ask for.
 */
export function rejectExtraArgs(action, rest, targets) {
    if (!rest?.length) return;
    const where = targets.length === 1 ? ` ('${targets[0].workspaceName}' is at ${targets[0].mountpoint})` : '';
    const name = targets.length === 1 ? targets[0].workspaceName : '<workspace>';
    throw new UsageError(`\`mirror ${action}\` takes a workspace name only, not '${rest.join(' ')}'${where}. A mirror's folder is set when it is created; to put it elsewhere: \`canvas mirror remove ${name}\`, then \`canvas workspace ${name} mount <path>\`.`);
}

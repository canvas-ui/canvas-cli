'use strict';

import path from 'node:path';
import { CanvasError } from '../../core/errors.js';
import * as packages from '../../core/packages.js';
import { CLI_VERSION, cliRelease, cleanupOldBinary, distBranchManifest, installMode, latestCliRelease, latestNpmVersion, updateBinary, updateNpm } from '../../core/update.js';

/*
 * The update plan: one row per component with what is installed, what is
 * available and the action that brings them together. Components:
 *
 *   cli            this executable (binary | npm | source)
 *   package:<key>  ~/.canvas/packages/<key>, compared by pack-dist's canvasRev
 *   service:<id>   whatever an installed package declares under `services`
 *                  ({ id, label, installed(), latest(), update({io}), restart?({io}) })
 *                  — canvas-edge from the mirror package, canvas-server from
 *                  the server package.
 */

export const TARGETS = ['all', 'cli', 'packages', 'services'];

function short(rev) { return rev ? String(rev).slice(0, 7) : null; }

async function cliRow({ to } = {}) {
    const mode = installMode();
    const row = { component: 'cli', kind: 'cli', mode: mode.mode, installed: CLI_VERSION, latest: null, status: 'unknown', where: mode.path };
    try {
        if (mode.mode === 'binary') {
            const release = to ? await cliRelease(to) : await latestCliRelease();
            row.release = release;
            row.latest = release?.version || null;
        } else if (mode.mode === 'npm') {
            row.latest = to || await latestNpmVersion();
        } else {
            row.latest = null;
            row.status = 'source checkout — update with git';
            return row;
        }
    } catch (err) {
        row.status = `check failed: ${err.message}`;
        return row;
    }
    if (!row.latest) { row.status = 'no release found'; return row; }
    const cmp = compare(row.latest, row.installed);
    row.status = to ? (row.latest === row.installed ? 'up to date' : `→ ${row.latest}`) : cmp > 0 ? `→ ${row.latest}` : 'up to date';
    row.pending = to ? row.latest !== row.installed : cmp > 0;
    return row;
}

function compare(a, b) {
    const pa = String(a).split(/[.-]/).map((x) => Number(x) || 0);
    const pb = String(b).split(/[.-]/).map((x) => Number(x) || 0);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
    return 0;
}

async function packageRows() {
    const rows = [];
    for (const key of packages.keys()) {
        const where = packages.locate(key);
        if (!where || where.source === 'dev') continue;
        const row = { component: `package:${key}`, kind: 'package', key, installed: where.rev ? `${where.version} (${short(where.rev)})` : where.version, latest: null, status: 'unknown', where: where.dir };
        try {
            const manifest = await distBranchManifest(packages.CATALOG[key].dist);
            if (!manifest) { row.status = 'no published dist'; rows.push(row); continue; }
            row.latest = manifest.rev ? `${manifest.version} (${short(manifest.rev)})` : manifest.version;
            row.pending = manifest.rev && where.rev ? short(manifest.rev) !== short(where.rev) : manifest.version !== where.version;
            row.status = row.pending ? `→ ${row.latest}` : 'up to date';
        } catch (err) {
            row.status = `check failed: ${err.message}`;
        }
        rows.push(row);
    }
    return rows;
}

/** Services declared by installed packages (the module's `services` export). */
export async function loadServices() {
    const services = [];
    for (const key of packages.keys()) {
        if (!packages.locate(key)) continue;
        let loaded = null;
        try { loaded = await packages.load(key); } catch { continue; }
        for (const svc of loaded?.mod?.services || []) {
            if (svc?.id && typeof svc.installed === 'function' && typeof svc.update === 'function') services.push({ ...svc, package: key });
        }
    }
    return services;
}

async function serviceRows(services) {
    const rows = [];
    for (const svc of services) {
        let installed = null;
        try { installed = await svc.installed(); } catch { installed = null; }
        if (!installed) continue;
        const row = { component: `service:${svc.id}`, kind: 'service', service: svc, installed: installed.rev ? `${installed.version || ''} (${short(installed.rev)})`.trim() : installed.version || 'installed', latest: null, status: 'unknown', where: installed.dir || installed.prefix || '' };
        try {
            const latest = typeof svc.latest === 'function' ? await svc.latest() : null;
            if (!latest) { row.status = 'check unavailable — will update anyway'; row.pending = true; rows.push(row); continue; }
            row.latest = latest.rev ? `${latest.version || ''} (${short(latest.rev)})`.trim() : latest.version || null;
            row.pending = latest.rev && installed.rev ? short(latest.rev) !== short(installed.rev) : Boolean(latest.version) && latest.version !== installed.version;
            row.status = row.pending ? `→ ${row.latest}` : 'up to date';
        } catch (err) {
            row.status = `check failed: ${err.message}`;
        }
        rows.push(row);
    }
    return rows;
}

/** Which components a target word selects. `<service id>` (edge, server) narrows to one service. */
export function selectTarget(target, services) {
    const t = String(target || 'all').toLowerCase();
    if (TARGETS.includes(t)) return { cli: t === 'all' || t === 'cli', packages: t === 'all' || t === 'packages', services: t === 'all' || t === 'services', serviceId: null };
    if (['package', 'pkg'].includes(t)) return { cli: false, packages: true, services: false, serviceId: null };
    if (services.some((s) => s.id === t)) return { cli: false, packages: false, services: true, serviceId: t };
    throw new CanvasError(`unknown update target '${target}' — one of: ${[...TARGETS, ...services.map((s) => s.id)].join(', ')}`);
}

export async function plan({ target = 'all', to = null } = {}) {
    cleanupOldBinary();
    const services = await loadServices();
    const sel = selectTarget(target, services);
    const rows = [];
    if (sel.cli) rows.push(await cliRow({ to }));
    if (sel.packages) rows.push(...(await packageRows()));
    if (sel.services) rows.push(...(await serviceRows(sel.serviceId ? services.filter((s) => s.id === sel.serviceId) : services)));
    return rows;
}

/** Apply the pending rows in order: packages first (they may carry the service updaters), services, the CLI last. */
export async function apply(rows, { io, spinner, restart = true } = {}) {
    const done = [];
    const order = { package: 0, service: 1, cli: 2 };
    for (const row of [...rows].filter((r) => r.pending).sort((a, b) => order[a.kind] - order[b.kind])) {
        const s = spinner();
        try {
            if (row.kind === 'package') {
                s.start(`Updating package ${row.key}…`);
                await packages.install(row.key, { update: true });
                const after = packages.locate(row.key);
                s.stop(`package ${row.key}: ${row.installed} → ${after?.rev ? `${after.version} (${short(after.rev)})` : after?.version}`);
            } else if (row.kind === 'service') {
                s.start(`Updating ${row.service.label || row.service.id}…`);
                const result = await row.service.update({ io, onStep: (m) => s.message(m) });
                s.stop(`${row.service.label || row.service.id}: ${row.installed} → ${result?.after || 'updated'}`);
                if (restart && typeof row.service.restart === 'function') {
                    const r = await row.service.restart({ io });
                    if (r?.restarted) io.success(`${row.service.label || row.service.id} restarted`);
                    else if (r?.skipped) io.info(`${row.service.label || row.service.id}: ${r.skipped}`);
                }
            } else if (row.kind === 'cli') {
                if (row.mode === 'binary') {
                    s.start(`Updating canvas ${row.installed} → ${row.latest}…`);
                    await updateBinary(row.release, { onStep: (m) => s.message(m) });
                    s.stop(`canvas ${row.installed} → ${row.latest} (${row.where})`);
                } else if (row.mode === 'npm') {
                    s.start(`Updating canvas ${row.installed} → ${row.latest} via npm…`);
                    await updateNpm(row.latest, { onStep: (m) => s.message(m) });
                    s.stop(`canvas ${row.installed} → ${row.latest} (npm -g)`);
                } else {
                    s.stop(`canvas: source checkout at ${row.where} — \`git pull\` there`);
                    continue;
                }
            }
            done.push(row);
        } catch (err) {
            s.stop(`${row.component}: update failed`);
            throw err;
        }
    }
    return done;
}

export function describeMode(row) {
    if (row.mode === 'binary') return `release binary at ${row.where}`;
    if (row.mode === 'npm') return `npm global install (${path.basename(row.where)})`;
    return `source checkout at ${row.where}`;
}

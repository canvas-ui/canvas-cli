'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';
import { edgeLogHint, ensureEdgeService, runEdgeForeground } from '../../../mirror/lib/edge.js';
import { listMirrors, splitList } from '../../../mirror/lib/config.js';
import { assertShareName, ensureDeviceToken, findShare, resolveFolder, shareId, upsertShare, waitForShare } from '../lib.js';

// Serve a folder of THIS machine to a workspace, read-only and in place:
//   canvas workspace universe share add /mnt/mywd --name wd1t.home --label "1TB WD" --mode ro
// The canvas-edge daemon hashes and watches the folder and answers the
// workspace's reads; nothing is copied and nothing is written into the folder.
// The name is <share>.<site>: the backend address, the authority of the
// files' file://wd1t.home/… URLs and the tree node /device/home/wd1t.
// The daemon is installed when missing and started: detached by default,
// under pm2 with --service, attached to the terminal with --foreground.
export default {
    name: 'add',
    description: 'Serve a local folder to the workspace as a read-only share (indexed in place)',
    positional: [{ name: 'folder', required: true }],
    flags: { workspace: 'string', name: 'string', label: 'string', mode: 'string', exclude: 'string', 'state-dir': 'string', 'no-watch': 'boolean', service: 'boolean', foreground: 'boolean', 'no-start': 'boolean' },
    async run(ctx) {
        const { args, flags, io } = ctx;
        const handle = resolveWorkspaceHandle(ctx);
        if (!args.folder) throw new UsageError('Folder required (e.g. share add /mnt/mywd --name wd1t.home)');
        const name = assertShareName(flags.name);
        const folder = resolveFolder(args.folder);
        const watch = !(flags['no-watch'] || flags.watch === false);
        const label = String(flags.label || name).trim();
        // ro: the workspace lists and reads, nothing is ever written to the folder.
        const mode = String(flags.mode || 'ro').toLowerCase();
        if (mode !== 'ro') throw new UsageError(`--mode ${flags.mode} is not available yet; a share is read-only (--mode ro, the default). rw and worm are planned`);

        // Registering first surfaces a taken or malformed name before anything is written here.
        const backend = await handle.api.workspaces.backends.add(handle.id, 'share', { name, label, watch, mode });
        const existing = findShare(handle.remoteId, handle.id, name);
        const share = upsertShare({
            ...existing,
            id: shareId(handle.remoteId, handle.id, name),
            remote: handle.remoteId, workspaceName: handle.id, name, label, mode, path: folder, watch,
            exclude: flags.exclude != null ? splitList(flags.exclude) : (existing?.exclude || []),
            ...(flags['state-dir'] ? { stateDir: flags['state-dir'] } : {}),
            paused: false,
            createdAt: existing?.createdAt || new Date().toISOString(),
        });
        io.success(`Share ${name} → ${folder}${backend?.treePath ? ` (tree: ${backend.treePath})` : ''}`);
        if (flags['no-start'] || flags.start === false) return;
        await ensureDeviceToken(ctx.client, handle.remoteId, handle.id, io);
        if (flags.foreground) {
            if (flags.service) throw new UsageError('--foreground and --service exclude each other');
            const code = await runEdgeForeground(io);
            if (code) process.exitCode = code;
            return share;
        }
        const managed = flags.service || listMirrors().some((m) => m.client === 'daemon' && m.managed === 'pm2') ? 'pm2' : 'manual';
        const res = await ensureEdgeService(io, { managed });
        io.info(`canvas-edge ${res.started ? 'started' : 'reloaded'}${managed === 'manual' ? ' (unsupervised; --service keeps it running under pm2)' : ''}.`);
        const unit = await waitForShare(share.id);
        const follow = `canvas workspace ${handle.id} share list`;
        if (unit?.connected) io.success(`${name} is connected to the workspace${unit.scanning ? '; the first pass hashes every file' : ` (${unit.files ?? '?'} files)`}. Follow it with: ${follow}`);
        else if (unit?.state === 'unavailable') io.warn(`${folder} is not available to the daemon (${unit.lastError || 'folder missing'}); the share stays offline until it is.`);
        else if (unit?.lastError) io.warn(`${name} is not connected: ${unit.lastError}\nDaemon log: ${edgeLogHint(managed)}`);
        else io.warn(`${name} has not connected yet; check it with: ${follow}\nDaemon log: ${edgeLogHint(managed)}`);
        return share;
    },
};

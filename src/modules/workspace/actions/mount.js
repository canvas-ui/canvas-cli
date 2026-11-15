'use strict';

import { mkdirSync } from 'node:fs';
import { UsageError } from '../../../core/errors.js';
import { input, isTTY } from '../../../core/prompt.js';
import { resolveWorkspaceHandle } from '../lib/handle.js';
import { buildMirror, defaultRoot, findMirror, mountpointFor, noStart, readConfig, rootForPath, splitList, upsertMirror } from '../../mirror/lib/config.js';
import { findHubWorkspace, listHubWorkspaces } from '../../mirror/lib/hub.js';
import { ensureFuse, startMirrors } from '../../mirror/lib/lifecycle.js';

/*
 * `canvas workspace <name> mount [path]` — the short way to a synced folder:
 * a canvas-fuse mirror entry (the same one `canvas mirror add` writes, so
 * `mirror status|pause|stop|…` apply), created on first use and started. The
 * binary is installed on demand.
 */
export default {
    name: 'mount',
    description: 'Mount the workspace as a synced folder on this device (path: where to put it; remembered afterwards)',
    positional: [{ name: 'path', required: false }],
    flags: { service: 'boolean', ignore: 'string', conflicts: 'string', deletes: 'string', 'no-start': 'boolean' },
    async run(ctx) {
        const { args, flags, client, io } = ctx;
        const handle = resolveWorkspaceHandle(ctx);
        const ws = findHubWorkspace(await listHubWorkspaces(client, handle.remoteId), handle.id);
        if (!ws) throw new UsageError(`Workspace '${handle.id}' not found on ${handle.remoteId}`);

        let mirror = findMirror(`${handle.remoteId}/${ws.name}`);
        if (mirror) {
            if (mirror.client !== 'fuse') throw new UsageError(`'${ws.name}' is kept in sync by canvas-edge at ${mirror.mountpoint} — \`canvas mirror start ${ws.name}\``);
            if (args.path && mountpointFor(rootForPath(args.path, mirror.folderName), mirror.folderName) !== mirror.mountpoint) {
                throw new UsageError(`'${ws.name}' is already set up at ${mirror.mountpoint} — \`canvas mirror remove ${ws.name}\` first to put it elsewhere`);
            }
        } else {
            let target = args.path || readConfig().root;
            if (!target) {
                const fallback = defaultRoot();
                target = isTTY() && !flags.yes ? (await input(`Folder to keep workspaces in [${fallback}]: `)).trim() || fallback : fallback;
            }
            const root = rootForPath(target, ws.folderName);
            mkdirSync(root, { recursive: true });
            mirror = upsertMirror(buildMirror({
                remoteId: handle.remoteId, workspaceId: ws.id, workspaceName: ws.name, folderName: ws.folderName, root,
                ignore: splitList(flags.ignore),
                conflicts: flags.conflicts || undefined,
                deletes: flags.deletes || 'propagate',
                client: 'fuse',
                managed: flags.service ? 'pm2' : 'manual',
            }));
            io.success(`Configured ${mirror.id} → ${mirror.mountpoint}`);
        }

        await ensureFuse(io, { yes: Boolean(flags.yes) });
        if (noStart(flags)) return;
        const [result] = await startMirrors([mirror], io);
        if (result?.ok) return;
        process.exitCode = 1;
        if (/fusermount3: mount failed: Permission denied/.test(result?.error || '')) {
            io.info(`The system refused a FUSE mount at ${mirror.mountpoint}. Ubuntu's AppArmor profile for fusermount3 only allows mounts under $HOME, /mnt, /media and /tmp; allow this location in /etc/apparmor.d/local/fusermount3 and reload the profile.`);
        }
    },
};

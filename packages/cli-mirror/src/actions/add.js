'use strict';

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { buildMirror, findMirror, parseWorkspaceSpec, readConfig, setRoot, splitList, upsertMirror, noStart } from '../lib/config.js';
import { startMirrors } from '../lib/lifecycle.js';
import { findHubWorkspace, listHubWorkspaces, resolveHub } from '../lib/hub.js';

export default {
    name: 'add',
    description: 'Mirror one more workspace on this device',
    positional: [{ name: 'workspace', required: true }],
    flags: { hub: 'string', root: 'string', pin: 'string', ignore: 'string', conflicts: 'string', deletes: 'string', client: 'string', 'cache-budget-mb': 'string', service: 'boolean', 'no-start': 'boolean' },
    async run({ args, flags, client, session, io }) {
        const { name, pins: specPins } = parseWorkspaceSpec(args.workspace);
        const remoteId = await resolveHub(flags, client, session, { interactive: !flags.yes });
        const ws = findHubWorkspace(await listHubWorkspaces(client, remoteId), name);
        if (!ws) throw new UsageError(`Workspace '${name}' not found on ${remoteId}`);
        if (findMirror(`${remoteId}/${ws.name}`)) throw new UsageError(`'${ws.name}' is already mirrored from ${remoteId}`);
        const root = path.resolve(flags.root || readConfig().root || '');
        if (!root || root === path.resolve('')) throw new UsageError('No mirror root yet — run `canvas remote mirror init` or pass --root');
        if (!existsSync(root)) mkdirSync(root, { recursive: true });
        if (!readConfig().root) setRoot(root);
        const mirror = upsertMirror(buildMirror({
            remoteId, workspaceId: ws.id, workspaceName: ws.name, folderName: ws.folderName, root,
            pins: [...specPins, ...splitList(flags.pin).map((p) => parseWorkspaceSpec(`x:${p}`).pins[0])],
            ignore: splitList(flags.ignore),
            conflicts: flags.conflicts || 'prompt',
            deletes: flags.deletes || 'propagate',
            managed: flags.service ? 'pm2' : 'manual',
            client: flags.client || (process.platform === 'linux' ? 'fuse' : 'daemon'),
            ...(flags['cache-budget-mb'] ? { cacheBudgetMb: Number(flags['cache-budget-mb']) } : {}),
        }));
        io.success(`Configured ${mirror.id} → ${mirror.mountpoint}`);
        if (noStart(flags)) return;
        await startMirrors([mirror], io);
    },
};

'use strict';

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { UsageError } from '../../../core/errors.js';
import { buildMirror, findMirror, parseWorkspaceSpec, readConfig, setRoot, splitList, upsertMirror } from '../lib/config.js';
import { fuseAvailable, mount } from '../lib/fuse.js';
import { startProcess } from '../lib/pm2.js';
import { listHubWorkspaces, resolveHub } from '../lib/hub.js';
import { ensureEdgeService } from '../lib/edge.js';

export default {
    name: 'add',
    description: 'Mirror one more workspace on this device',
    positional: [{ name: 'workspace', required: true }],
    flags: { hub: 'string', root: 'string', pin: 'string', ignore: 'string', conflicts: 'string', deletes: 'string', client: 'string', 'cache-budget-mb': 'string', service: 'boolean', 'no-start': 'boolean' },
    async run({ args, flags, client, session, io }) {
        const { name, pins: specPins } = parseWorkspaceSpec(args.workspace);
        const remoteId = await resolveHub(flags, client, session, { interactive: !flags.yes });
        if (findMirror(`${remoteId}/${name}`)) throw new UsageError(`'${name}' is already mirrored from ${remoteId}`);
        const ws = (await listHubWorkspaces(client, remoteId)).find((w) => w.name === name || w.id === name);
        if (!ws) throw new UsageError(`Workspace '${name}' not found on ${remoteId}`);
        const root = path.resolve(flags.root || readConfig().root || '');
        if (!root || root === path.resolve('')) throw new UsageError('No mirror root yet — run `canvas mirror init` or pass --root');
        if (!existsSync(root)) mkdirSync(root, { recursive: true });
        if (!readConfig().root) setRoot(root);
        const mirror = upsertMirror(buildMirror({
            remoteId, workspaceId: ws.id, workspaceName: ws.name, root,
            pins: [...specPins, ...splitList(flags.pin).map((p) => parseWorkspaceSpec(`x:${p}`).pins[0])],
            ignore: splitList(flags.ignore),
            conflicts: flags.conflicts || 'prompt',
            deletes: flags.deletes || 'propagate',
            managed: flags.service ? 'pm2' : 'manual',
            client: flags.client || (process.platform === 'linux' ? 'fuse' : 'daemon'),
            ...(flags['cache-budget-mb'] ? { cacheBudgetMb: Number(flags['cache-budget-mb']) } : {}),
        }));
        io.success(`Configured ${mirror.id} → ${mirror.mountpoint}`);
        if (flags['no-start']) return;
        if (mirror.client === 'daemon') {
            const { started } = await ensureEdgeService(io);
            io.success(`${started ? 'Started' : 'Reloaded'} canvas-edge → ${mirror.mountpoint}`);
            return;
        }
        if (!(await fuseAvailable())) { io.warn('canvas-fuse not found; start later with `canvas mirror start`.'); return; }
        if (mirror.managed === 'pm2') {
            const { name: proc } = await startProcess(mirror);
            io.success(`Started ${proc}`);
        } else {
            const res = await mount(mirror);
            if (res.ok) io.success(`Mounted ${mirror.mountpoint}`);
            else io.error(`Mount failed: ${res.stderr.trim() || res.stdout.trim()}`);
        }
    },
};

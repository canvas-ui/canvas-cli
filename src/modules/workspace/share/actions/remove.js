'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';
import { edgeReload } from '../../../mirror/lib/edge.js';
import { removeShare, shareId } from '../lib.js';

// Stop serving a share from this machine and drop it from the workspace.
// Files in the folder are never touched. To keep the catalog of a drive that
// goes into a drawer, do not remove the share: unplug the drive.
export default {
    name: 'remove',
    description: 'Stop serving a share and remove it from the workspace (--local: only stop serving it here)',
    aliases: ['rm'],
    positional: [{ name: 'name', required: true }],
    flags: { workspace: 'string', local: 'boolean' },
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const name = ctx.args.name;
        if (!name) throw new UsageError('Share name required (e.g. share remove wd1t.home)');
        const served = removeShare(shareId(handle.remoteId, handle.id, name));
        if (served) await edgeReload().catch(() => {});
        if (ctx.flags.local) {
            if (!served) throw new UsageError(`This machine does not serve ${name}`);
            ctx.io.success(`Stopped serving ${name} from this machine; the workspace keeps its catalog (the share shows offline)`);
            return;
        }
        await handle.api.workspaces.backends.remove(handle.id, 'share', name);
        ctx.io.success(`Removed share ${name}${served ? '' : ' from the workspace (it was not served from this machine)'}; files in the folder are untouched`);
    },
};

'use strict';

import { resolveWorkspaceHandle } from '../../lib/handle.js';
import { CanvasError, UsageError } from '../../../../core/errors.js';
import { edgeShareScan } from '../../../mirror/lib/edge.js';
import { pickShare } from '../lib.js';

// Walk and hash a share's folder again now (the daemon does it on start and
// every six hours; a watched share also follows changes as they happen).
export default {
    name: 'scan',
    description: 'Rescan a share served from this machine now',
    positional: [{ name: 'name' }],
    flags: { workspace: 'string' },
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const share = pickShare(handle.remoteId, handle.id, ctx.args.name);
        if (!share) throw new UsageError(`This machine does not serve ${ctx.args.name}; run the scan on the machine that holds the folder`);
        let result;
        try { result = await edgeShareScan(share.id); }
        catch (error) { throw new CanvasError(`canvas-edge did not take the scan (${error.message}); is it running? See: canvas workspace ${handle.id} share list`); }
        if (result?.ok === false) throw new CanvasError(`${share.path} is not available (${result.reason}); nothing was scanned and the catalog is unchanged`);
        if (result?.running) { ctx.io.success(`Scanning ${share.path}; follow it with: canvas workspace ${handle.id} share list`); return; }
        ctx.io.success(`Scanned ${share.path}: ${result?.count ?? '?'} files${result?.complete === false ? ' (some folders could not be read)' : ''}`);
    },
};

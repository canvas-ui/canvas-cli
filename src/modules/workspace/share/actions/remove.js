'use strict';

import fs from 'node:fs';
import { resolveWorkspaceHandle } from '../../lib/handle.js';
import { UsageError } from '../../../../core/errors.js';
import { edgeReload } from '../../../mirror/lib/edge.js';
import { findShare, removeShare, shareStateDir } from '../lib.js';

// Stop serving a share from this machine and drop it from the workspace.
// Files in the folder are never touched. To keep the catalog of a drive that
// goes into a drawer, do not remove the share: unplug the drive.
//
// A document that also lives elsewhere in the workspace only loses its
// location on the share. One that lives nowhere else has to be decided on:
// --purge deletes it (with its tags and tree placements), --keep leaves it in
// the workspace Trash as an orphan.
export default {
    name: 'remove',
    description: 'Stop serving a share and remove it from the workspace (--purge | --keep its share-only documents; --local: only stop serving it here)',
    aliases: ['rm'],
    positional: [{ name: 'name', required: true }],
    flags: { workspace: 'string', local: 'boolean', purge: 'boolean', keep: 'boolean' },
    async run(ctx) {
        const handle = resolveWorkspaceHandle(ctx);
        const { flags, io } = ctx;
        const name = ctx.args.name;
        if (!name) throw new UsageError('Share name required (e.g. share remove wd1t.home)');
        if (flags.purge && flags.keep) throw new UsageError('--purge and --keep exclude each other');
        const local = findShare(handle.remoteId, handle.id, name);

        if (flags.local) {
            if (!local) throw new UsageError(`This machine does not serve ${name}`);
            await stopServing(local);
            io.success(`Stopped serving ${name} from this machine; the workspace keeps its catalog (the share shows offline)`);
            return;
        }

        const base = `/workspaces/${encodeURIComponent(handle.id)}/backends/share/${encodeURIComponent(name)}`;
        // How many documents the share lists, and how many of them live nowhere else.
        const total = (params = {}) => handle.api.get(`${base}/documents`, { params: { ...params, limit: 1 }, envelope: true }).then((list) => list.totalCount ?? 0);
        const [documents, onlyHere] = flags.purge || flags.keep ? [0, 0] : await Promise.all([total(), total({ exclusive: true })]);
        if (onlyHere > 0) {
            throw new UsageError(`${name} lists ${documents} documents: ${documents - onlyHere} also live elsewhere in the workspace and stay, ${onlyHere} live only on this share.\n`
                + '  --purge  delete those documents from the workspace (their tags and tree placements go too)\n'
                + '  --keep   leave them in the workspace Trash as orphans\n'
                + 'Files in the folder are untouched either way.');
        }
        // The workspace first: a refused removal leaves the share served.
        const result = await handle.api.delete(base, { params: { documents: flags.purge ? 'purge' : 'keep' } });
        if (local) await stopServing(local);
        const counts = result?.documents;
        const what = !counts?.documents ? 'it listed no documents'
            : [counts.kept ? `${counts.kept} documents stay (they live elsewhere too)` : null,
                counts.purged ? `${counts.purged} share-only documents ${result.state === 'running' ? 'are being deleted' : 'were deleted'}` : null,
                counts.orphaned ? `${counts.orphaned} share-only documents ${result.state === 'running' ? 'are moving' : 'moved'} to the workspace Trash` : null].filter(Boolean).join(', ');
        io.success(`Removed share ${name}${local ? '' : ' from the workspace (it was not served from this machine)'}: ${what}. Files in the folder are untouched.`);
    },
};

// The entry, the unit in the running daemon, and the index the daemon kept for the share.
async function stopServing(share) {
    removeShare(share.id);
    await edgeReload().catch(() => {});
    fs.rmSync(shareStateDir(share), { recursive: true, force: true });
}

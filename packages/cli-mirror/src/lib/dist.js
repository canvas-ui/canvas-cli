'use strict';

import { CanvasError } from '@augmentd-labs/canvas-cli-host/errors';

export const CLI_VERSION_HEADER = 'canvas-cli';

/** { version, rev } from the package.json pack-dist published on `branch` of `repo` (null when the branch has none). */
export async function distManifest(repo, branch) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 20_000);
    try {
        const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/package.json`, { headers: { 'user-agent': CLI_VERSION_HEADER }, signal: abort.signal });
        if (res.status === 404) return null;
        if (!res.ok) throw new CanvasError(`${repo}#${branch}: HTTP ${res.status}`);
        const json = await res.json();
        return { version: json.version || null, rev: json.canvasRev || null };
    } catch (err) {
        if (err instanceof CanvasError) throw err;
        throw new CanvasError(`${repo}#${branch}: ${abort.signal.aborted ? 'timed out' : err?.cause?.message || err.message}`);
    } finally {
        clearTimeout(timer);
    }
}

'use strict';

// Document construction lives in @canvas/schemas; this module keeps the
// CLI-flag plumbing (path specs, insert targets) and the historical
// cli signature of buildNoteDoc (bare string title).
import { buildNoteDoc as buildNote } from '@canvas/schemas';

export { buildTabDoc, tagsToFeatures } from '@canvas/schemas';

export function buildNoteDoc(content, title) {
    return buildNote(content, { title });
}

/**
 * Parse a single --path spec into an insert target.
 *   "/foo/bar"          → default context tree, path /foo/bar
 *   "mytree:/foo/bar"   → tree named mytree (type auto-detected server-side)
 *   "mytree:foo"        → tree mytree, path /foo (leading slash added)
 * @param {string} spec
 * @returns {{ treeNameOrTreeId?: string, treeType?: string, context: string }}
 */
export function parsePathSpec(spec) {
    const s = String(spec).trim();
    // Bare absolute path → default context tree, let server resolve type.
    if (s.startsWith('/')) return { context: s, treeType: 'context' };
    const idx = s.indexOf(':');
    if (idx > 0) {
        const treeName = s.slice(0, idx).trim();
        let path = s.slice(idx + 1).trim() || '/';
        if (!path.startsWith('/')) path = '/' + path;
        // treeType omitted on purpose — server detects from the tree name.
        return { treeNameOrTreeId: treeName, context: path };
    }
    // Relative path, no tree prefix → context tree.
    return { context: '/' + s, treeType: 'context' };
}

export function parseTargets(flags) {
    const targets = [];

    // Preferred unified syntax: --path treeName:/path (repeatable).
    const rawPath = flags.path;
    const pathSpecs = rawPath ? (Array.isArray(rawPath) ? rawPath : [rawPath]) : [];
    for (const spec of pathSpecs) targets.push(parsePathSpec(spec));

    // Legacy aliases, kept for back-compat: -c/--context, -d/--directory.
    const rawCtx = flags.context;
    const contextPaths = rawCtx
        ? (Array.isArray(rawCtx) ? rawCtx : [rawCtx])
        : [];
    for (const cp of contextPaths) targets.push({ context: cp, treeType: 'context' });
    if (flags.directory) targets.push({ context: flags.directory, treeType: 'directory' });

    if (targets.length === 0) targets.push({ context: '/', treeType: 'context' });
    return targets;
}

/**
 * Insert-body fields for a target. Emits treeNameOrTreeId when set; omits
 * treeType if a tree name is present so the server can auto-detect it.
 */
export function targetBody(t) {
    const body = { context: t.context };
    if (t.treeNameOrTreeId) body.treeNameOrTreeId = t.treeNameOrTreeId;
    if (t.treeType) body.treeType = t.treeType;
    return body;
}

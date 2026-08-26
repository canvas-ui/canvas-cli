'use strict';

import { UsageError } from '../../../core/errors.js';
import { unwrapResource } from '../../../core/api-helpers.js';
import { resolveContextHandle } from '../lib/handle.js';
import { CONTEXT_COLUMNS } from '../lib/columns.js';

/**
 * The empty feature spec. `setQuery` on the server takes `features: null` to
 * mean "no binding", but the route's body schema types the field as an object,
 * so null is rejected before it gets there — three empty buckets mean the same
 * thing to the merge and survive validation.
 */
const NO_FEATURES = { allOf: [], anyOf: [], noneOf: [] };

export default {
    name: 'update',
    description: 'Update a context',
    flags: { description: 'string', metadata: 'string', 'clear-filter': 'boolean' },
    async run(ctx) {
        const { flags, io } = ctx;
        const handle = resolveContextHandle(ctx);
        const data = {};
        if (flags.description) data.description = flags.description;
        if (flags.metadata) data.metadata = JSON.parse(flags.metadata);

        if (flags['clear-filter']) {
            if (flags.metadata) {
                throw new UsageError('--clear-filter rewrites metadata; it cannot be combined with --metadata');
            }
            data.features = NO_FEATURES;
            data.filters = [];
            // The web renders its filter chips from metadata.toolbox, and mirrors
            // them into features/filters. Clearing only the binding would leave
            // the chips standing — and the next toolbox save would put the
            // binding straight back.
            const current = unwrapResource(await handle.api.contexts.get(handle.id), 'context');
            const metadata = clearToolboxFilters(current?.metadata);
            if (metadata) data.metadata = metadata;
        }

        if (Object.keys(data).length === 0) {
            throw new UsageError('Nothing to update. Use --description, --metadata or --clear-filter');
        }
        const updated = await handle.api.contexts.update(handle.id, data);
        io.success(`Context '${handle.full || handle.id}' updated`);
        io.detail(unwrapResource(updated, 'context'), { columns: CONTEXT_COLUMNS });
    },
};

/**
 * Strip the filter half of the toolbox state, leaving the rest (sort order,
 * geo, lens) alone — those are how the view is presented, not what it holds.
 * @returns {Object|null} null when there was no toolbox state to rewrite
 */
function clearToolboxFilters(metadata) {
    const toolbox = metadata?.toolbox;
    if (!toolbox || typeof toolbox !== 'object') return null;
    const timeline = toolbox.timeline && typeof toolbox.timeline === 'object'
        ? { ...toolbox.timeline, quickFilter: null, customRanges: [], customRange: null }
        : toolbox.timeline;
    return {
        ...metadata,
        toolbox: { ...toolbox, features: { ...NO_FEATURES }, ...(timeline ? { timeline } : {}) },
    };
}

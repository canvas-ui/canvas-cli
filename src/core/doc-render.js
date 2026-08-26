'use strict';

import { featuresToTags } from '@augmentd-labs/canvas-schemas';

/**
 * What each kind of document should show in a list, and in a detail view.
 *
 * A note listed by title alone is unusable — the server titles untitled notes
 * `20260826`, so five of them look identical. A file without size or location
 * hides the one thing that distinguishes an uploaded copy from a device
 * pointer. So columns are per-schema, the way the web renders them
 * (apps/web/src/lib/document-display.ts), rather than one generic row.
 *
 * `id` comes first everywhere because it is what the next command takes
 * (`note get <id>`, `note rm <id>`).
 */

const tags = { label: 'tags', get: (d) => featuresToTags(d?.features || d?.metadata?.features), format: 'list', width: 18, dim: true };
const updated = { key: 'updatedAt', label: 'updated', format: 'date' };

// Where the bytes actually are: `stored://` = uploaded, `file://<device>/…` =
// indexed in place on that device.
function location(doc) {
    const url = doc?.locations?.[0]?.url;
    if (typeof url !== 'string') return null;
    if (url.startsWith('stored://')) return 'stored';
    const m = url.match(/^file:\/\/([^/]+)\//);
    return m ? `device:${m[1]}` : url.split('://')[0];
}

const COLUMNS = {
    'data/schema/note': [
        'id',
        { key: 'data.title', label: 'title', width: 24 },
        { key: 'data.content', label: 'preview', width: 42, dim: true },
        tags,
        updated,
    ],
    'data/schema/tab': [
        'id',
        { key: 'data.title', label: 'title', width: 28 },
        { key: 'data.url', label: 'url', width: 44, dim: true },
        tags,
        updated,
    ],
    'data/schema/task': [
        'id',
        { key: 'data.title', label: 'title', width: 32 },
        { key: 'data.status', label: 'status' },
        { key: 'data.dueDate', label: 'due', format: 'date' },
        { key: 'data.priority', label: 'prio' },
        tags,
    ],
    'data/schema/link': [
        'id',
        { key: 'data.label', label: 'label', width: 24 },
        { key: 'data.uri', label: 'uri', width: 48, dim: true },
        { key: 'data.type', label: 'type' },
        tags,
    ],
    'data/schema/file': [
        'id',
        { key: 'metadata.filename', label: 'filename', width: 32 },
        { key: 'metadata.size', label: 'size', format: 'bytes' },
        { key: 'metadata.contentType', label: 'type', width: 22, dim: true },
        { label: 'where', get: location, width: 18, dim: true },
        updated,
    ],
    'data/schema/message/email': [
        'id',
        { key: 'data.subject', label: 'subject', width: 40 },
        { key: 'data.from', label: 'from', width: 28, dim: true },
        { key: 'data.date', label: 'date', format: 'date' },
    ],
    'data/schema/identity': [
        'id',
        { key: 'data.name', label: 'name', width: 28 },
        { key: 'data.email', label: 'email', width: 30, dim: true },
        { key: 'schema', label: 'kind', get: (d) => leaf(d?.schema) },
    ],
    'data/schema/dotfile': [
        'id',
        { label: 'entry', get: (d) => entryPath(d?.data?.url), width: 32 },
        { label: 'devices', get: (d) => Object.keys(d?.data?.links || {}).length },
        { key: 'data.tags', label: 'tags', format: 'list', width: 18, dim: true },
    ],
};

// Any schema without a table of its own — including everything the noun table
// does not name — still lists usefully.
const GENERIC = [
    'id',
    { label: 'schema', get: (d) => leaf(d?.schema) },
    { label: 'title', get: title, width: 40 },
    tags,
    updated,
];

/**
 * Columns for a list of documents of one schema (or mixed, for `doc list`).
 * @param {string|null} schema
 */
export function listColumns(schema) {
    if (!schema) return GENERIC;
    return COLUMNS[schema] || COLUMNS[baseSchema(schema)] || GENERIC;
}

/**
 * Columns for one document shown on its own. Adds the fields that are too
 * wide for a table but are the whole point of a detail view.
 */
export function detailColumns(doc) {
    const schema = doc?.schema;
    const base = [...listColumns(schema)].filter((c) => (typeof c === 'string' ? c !== 'id' : true));
    const extras = [];
    if (doc?.data?.content) extras.push({ key: 'data.content', label: 'content' });
    if (doc?.data?.description) extras.push({ key: 'data.description', label: 'description' });
    if (doc?.comment) extras.push({ key: 'comment', label: 'comment' });
    if (doc?.locations?.length) {
        extras.push({ label: 'locations', get: (d) => d.locations.map((l) => l.url), format: 'list' });
    }
    return [
        'id',
        { label: 'schema', get: (d) => d?.schema },
        ...base.filter((c) => !isKey(c, 'data.content')),
        ...extras,
        { key: 'createdAt', label: 'created', format: 'date' },
    ];
}

/** The human name of a document, wherever this schema happens to keep it. */
export function title(doc) {
    const d = doc?.data || {};
    return d.title || d.label || d.name || d.subject || doc?.metadata?.filename
        || d.url || d.uri || (d.content ? String(d.content).slice(0, 60) : null);
}

function isKey(col, key) {
    return typeof col === 'object' && col.key === key;
}

function leaf(schema) {
    return typeof schema === 'string' ? schema.replace(/^data\/schema\//, '') : schema;
}

// `data/schema/dotfile/file` shares its columns with `data/schema/dotfile`.
function baseSchema(schema) {
    const parts = String(schema).split('/');
    return parts.length > 3 ? parts.slice(0, 3).join('/') : schema;
}

function entryPath(url) {
    if (typeof url !== 'string') return null;
    const hash = url.indexOf('#');
    return hash < 0 ? url : url.slice(hash + 1);
}

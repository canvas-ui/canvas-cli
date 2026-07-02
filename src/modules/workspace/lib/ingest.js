'use strict';

import { stat, readdir, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname, basename } from 'node:path';
import { promisify } from 'node:util';

const statAsync = promisify(stat);
const readdirAsync = promisify(readdir);

// ─── Default exclusions ───────────────────────────────────────────────────────

export const DEFAULT_EXCLUDE_DIRS = new Set([
    'node_modules', '.git', '__pycache__', '.pytest_cache', '.mypy_cache',
    '.ruff_cache', '.tox', '.eggs', 'dist', 'build', 'out', '.next', '.nuxt',
    '.svelte-kit', '.vitepress', 'coverage', '.coverage', '.nyc_output',
    '.cache', '.parcel-cache', '.turbo', '.vercel', '.netlify', '.output',
    'vendor', 'bower_components', '.idea', '.vscode', '.vs', '.fleet',
    'tmp', 'temp', 'logs', '.terraform', '.serverless', 'cdk.out',
]);

export const DEFAULT_EXCLUDE_EXTS = new Set([
    '.pyc', '.pyo', '.pyd', '.class', '.o', '.a', '.so', '.dylib', '.dll',
    '.exe', '.bin', '.map', '.snap',
]);

export const DEFAULT_EXCLUDE_FILES = new Set([
    '.DS_Store', 'Thumbs.db', 'desktop.ini',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
    'Cargo.lock', 'Gemfile.lock', 'composer.lock', 'poetry.lock',
    'go.sum',
]);

// ─── Walker ──────────────────────────────────────────────────────────────────

/**
 * Async generator — yields absolute file paths under dir.
 * @param {string} dir
 * @param {{ exclude?: string[], noDefaults?: boolean, maxDepth?: number, _depth?: number }} opts
 */
export async function* walkFiles(dir, {
    exclude = [],
    noDefaults = false,
    maxDepth = 30,
    _depth = 0,
} = {}) {
    if (_depth > maxDepth) return;

    const excludeDirs = noDefaults
        ? new Set(exclude)
        : new Set([...DEFAULT_EXCLUDE_DIRS, ...exclude]);

    let entries;
    try {
        entries = await readdirAsync(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (excludeDirs.has(entry.name)) continue;
            yield* walkFiles(full, { exclude, noDefaults, maxDepth, _depth: _depth + 1 });
        } else if (entry.isFile()) {
            if (!noDefaults) {
                const ext = extname(entry.name).toLowerCase();
                if (DEFAULT_EXCLUDE_EXTS.has(ext)) continue;
                if (DEFAULT_EXCLUDE_FILES.has(entry.name)) continue;
            }
            yield full;
        }
    }
}

// ─── Hasher ──────────────────────────────────────────────────────────────────

/**
 * Stream file through sha256 + md5 simultaneously.
 * @param {string} filePath
 * @returns {Promise<{ sha256: string, md5: string, size: number }>}
 */
export function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const sha256 = createHash('sha256');
        const md5 = createHash('md5');
        let size = 0;
        const stream = createReadStream(filePath);
        stream.on('data', (chunk) => {
            sha256.update(chunk);
            md5.update(chunk);
            size += chunk.length;
        });
        stream.on('end', () => resolve({
            sha256: sha256.digest('hex'),
            md5: md5.digest('hex'),
            size,
        }));
        stream.on('error', reject);
    });
}

// ─── MIME ─────────────────────────────────────────────────────────────────────

const MIME_MAP = {
    // Text
    '.txt': 'text/plain', '.md': 'text/markdown', '.rst': 'text/x-rst',
    '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.log': 'text/plain',
    // Web
    '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.xml': 'application/xml', '.xhtml': 'application/xhtml+xml',
    // Data
    '.json': 'application/json', '.jsonl': 'application/x-ndjson',
    '.yaml': 'application/yaml', '.yml': 'application/yaml',
    '.toml': 'application/toml', '.ini': 'text/plain', '.env': 'text/plain',
    // Code
    '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.cjs': 'application/javascript', '.ts': 'application/typescript',
    '.tsx': 'application/typescript', '.jsx': 'application/javascript',
    '.py': 'text/x-python', '.rb': 'text/x-ruby', '.php': 'application/x-php',
    '.go': 'text/x-go', '.rs': 'text/x-rust', '.java': 'text/x-java',
    '.kt': 'text/x-kotlin', '.swift': 'text/x-swift',
    '.c': 'text/x-c', '.cpp': 'text/x-c++', '.cc': 'text/x-c++',
    '.h': 'text/x-c', '.hpp': 'text/x-c++',
    '.cs': 'text/x-csharp', '.fs': 'text/x-fsharp',
    '.sh': 'application/x-sh', '.bash': 'application/x-sh', '.zsh': 'application/x-sh',
    '.fish': 'application/x-sh', '.ps1': 'application/x-powershell',
    '.vue': 'text/x-vue', '.svelte': 'text/x-svelte',
    '.lua': 'text/x-lua', '.r': 'text/x-r', '.m': 'text/x-matlab',
    '.ex': 'text/x-elixir', '.exs': 'text/x-elixir',
    '.erl': 'text/x-erlang', '.hs': 'text/x-haskell',
    '.clj': 'text/x-clojure', '.scala': 'text/x-scala',
    '.tf': 'text/x-terraform', '.hcl': 'text/x-hcl',
    '.sql': 'application/sql', '.graphql': 'application/graphql',
    '.proto': 'text/x-protobuf',
    // Docs
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Images
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.bmp': 'image/bmp', '.tiff': 'image/tiff',
    // Audio/Video
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
    // Archives
    '.zip': 'application/zip', '.tar': 'application/x-tar',
    '.gz': 'application/gzip', '.bz2': 'application/x-bzip2',
    '.xz': 'application/x-xz', '.7z': 'application/x-7z-compressed',
    '.rar': 'application/x-rar-compressed',
};

export function guessMime(filePath) {
    const ext = extname(filePath).toLowerCase();
    return MIME_MAP[ext] || 'application/octet-stream';
}

// ─── Client-side filesystem metadata ───────────────────────────────────────────

function _clean(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))) { out[k] = v; }
    }
    return out;
}

/** Structured filesystem stat → metadata.fs (birthtime/ctime/mode/uid/gid). */
export function fsMeta(stat) {
    const iso = (d) => (d instanceof Date && !Number.isNaN(d.getTime())) ? d.toISOString() : undefined;
    return _clean({
        birthtime: iso(stat.birthtime),
        ctime: iso(stat.ctime),
        mode: stat.mode,
        uid: stat.uid,
        gid: stat.gid,
    });
}

// Lazy, optional native xattr reader. Absent lib (not installed / unsupported
// platform) → {}. Never throws.
let _xattr;
let _xattrLoaded = false;
async function _loadXattr() {
    if (_xattrLoaded) { return; }
    _xattrLoaded = true;
    try { _xattr = await import('fs-xattr'); } catch { /* optional dep */ }
}

/** Extended attributes as a flat {key: utf8-value} map. {} if unavailable. */
export async function readXattrs(filePath) {
    await _loadXattr();
    const list = _xattr?.list || _xattr?.default?.list;
    const get = _xattr?.get || _xattr?.default?.get;
    if (!list || !get) { return {}; }
    try {
        const keys = await list(filePath);
        const out = {};
        for (const k of keys) {
            try { out[k] = (await get(filePath, k)).toString('utf8'); } catch { /* skip unreadable */ }
        }
        return out;
    } catch { return {}; }
}

// ─── Document builder ─────────────────────────────────────────────────────────

/**
 * Build a File document object ready for the workspace documents API.
 * @param {string} absPath
 * @param {{ deviceId: string, sha256: string, md5: string, size: number, mimeType: string, mtime?: Date }} opts
 * @returns {object}
 */
export function buildFileDoc(absPath, { deviceId, sha256, md5, size, mimeType, mtime, fs, xattrs }) {
    // file://<deviceId>/<absolute-path-without-leading-slash>
    const fileUrl = `file://${deviceId}/${absPath.replace(/^\//, '')}`;
    return {
        schema: 'data/abstraction/file',
        schemaVersion: '3.0',
        checksumArray: [`sha256/${sha256}`, `md5/${md5}`],
        locations: [{ url: fileUrl }],
        metadata: {
            contentType: mimeType,
            size,
            filename: basename(absPath),
            mtime: mtime ? mtime.toISOString() : undefined,
            ...(fs && Object.keys(fs).length ? { fs } : {}),
            ...(xattrs && Object.keys(xattrs).length ? { xattrs } : {}),
        },
        data: {},
    };
}

/**
 * Stat + hash + build a File document for a single local path.
 * `add` indexes in place (file://device) — bytes stay on the device, so no
 * server-side EXIF extraction; we still capture client stat + xattrs.
 * @param {string} absPath
 * @param {string} deviceId
 * @returns {Promise<object>}
 */
export async function ingestFile(absPath, deviceId) {
    const fstat = await statAsync(absPath);
    const { sha256, md5, size } = await hashFile(absPath);
    const mimeType = guessMime(absPath);
    const xattrs = await readXattrs(absPath);
    return buildFileDoc(absPath, { deviceId, sha256, md5, size, mimeType, mtime: fstat.mtime, fs: fsMeta(fstat), xattrs });
}

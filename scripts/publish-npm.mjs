#!/usr/bin/env node
// Publishes this repo's npm packages — every version the registry does not
// have yet, so it is safe on every push to main (release.yml):
//
//   @augmentd-labs/canvas-cli          the CLI (root)          pnpm pack
//   @augmentd-labs/canvas-cli-host     extension SDK           pnpm pack
//   @augmentd-labs/canvas-cli-mirror   lazily installed        single-file bundle
//   @augmentd-labs/canvas-cli-server     packages (`canvas       single-file bundle
//   @augmentd-labs/canvas-cli-desktop    package install …`)   single-file bundle
//
// `pnpm pack` rewrites workspace:* to the real versions. The lazy packages are
// esbuild-bundled into dist/index.js with every dependency inlined: the
// bun-compiled CLI imports them from ~/.canvas/packages/<key> but cannot
// resolve bare specifiers from an external file.
//
// Usage: node scripts/publish-npm.mjs [name,…] [--dry-run] [--pack <dir>]
// --pack writes the tarballs to <dir> instead of publishing (published or not).
// Prints `published=<names>` for the workflow. Auth: CI uses npm trusted
// publishing (OIDC, provenance attached); locally, your npm config's token.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const PACKAGES = {
    cli: { dir: '.' },
    'cli-host': { dir: 'packages/cli-host' },
    'cli-mirror': { dir: 'packages/cli-mirror', bundle: 'src/index.js' },
    'cli-server': { dir: 'packages/cli-server', bundle: 'src/index.js' },
    'cli-desktop': { dir: 'packages/cli-desktop', bundle: 'src/index.js' },
};

const readPkg = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

function published(name, version) {
    try {
        return execFileSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === version;
    } catch {
        return false; // E404: not on the registry yet
    }
}

function gitRev() {
    try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

/** pnpm pack → tarball path (workspace:* rewritten to versions). */
function packed(srcDir, out) {
    const before = new Set(readdirSync(out));
    execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', out], { cwd: srcDir, stdio: ['ignore', 'ignore', 'inherit'] });
    const tgz = readdirSync(out).find((f) => f.endsWith('.tgz') && !before.has(f));
    if (!tgz) throw new Error(`pnpm pack produced no tarball in ${out}`);
    return join(out, tgz);
}

/** esbuild the package into <stage>/dist/index.js; a manifest without dependencies. */
async function bundled(srcDir, entry, stage) {
    const esbuild = await import('esbuild');
    mkdirSync(join(stage, 'dist'), { recursive: true });
    await esbuild.build({
        entryPoints: [join(srcDir, entry)],
        outfile: join(stage, 'dist', 'index.js'),
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node20',
        // CJS deps (debug, chalk's supports-color probe) need a `require` in ESM output.
        banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
        logLevel: 'warning',
        legalComments: 'none',
    });
    for (const f of ['NOTICE', 'README.md']) if (existsSync(join(srcDir, f))) cpSync(join(srcDir, f), join(stage, f));
    cpSync(join(root, 'LICENSE'), join(stage, 'LICENSE'));
    const pkg = readPkg(srcDir);
    const manifest = { ...pkg, exports: { '.': './dist/index.js' }, main: './dist/index.js', files: ['dist', 'NOTICE'], dependencies: {}, canvasRev: gitRev() };
    delete manifest.scripts; delete manifest.devDependencies;
    writeFileSync(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    return stage;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const packIdx = args.indexOf('--pack');
    const packDir = packIdx >= 0 ? resolve(args[packIdx + 1]) : null;
    if (packDir) mkdirSync(packDir, { recursive: true });
    const only = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--pack');
    const keys = only ? only.split(',') : Object.keys(PACKAGES);
    for (const k of keys) if (!PACKAGES[k]) throw new Error(`unknown package '${k}' (${Object.keys(PACKAGES).join(', ')})`);

    const out = mkdtempSync(join(tmpdir(), 'canvas-cli-npm-'));
    const done = [];
    let failed = 0;
    try {
        for (const k of keys) {
            const t = PACKAGES[k];
            const srcDir = join(root, t.dir);
            const { name, version } = readPkg(srcDir);
            if (!packDir && published(name, version)) { console.log(`${name}@${version}: already on npm — skipping`); continue; }
            const target = t.bundle ? await bundled(srcDir, t.bundle, join(out, k)) : packed(srcDir, out);
            if (packDir) {
                if (t.bundle) execFileSync('npm', ['pack', '--pack-destination', packDir], { cwd: target, stdio: ['ignore', 'ignore', 'inherit'] });
                else cpSync(target, join(packDir, target.split('/').pop()));
                console.log(`${name}@${version}: packed → ${packDir}`);
                continue;
            }
            const cmd = ['publish', target, '--access', 'public'];
            // Provenance needs CI's OIDC identity; the CLI's publishConfig asks for it,
            // so a local (first) publish must switch it off explicitly.
            cmd.push(process.env.GITHUB_ACTIONS === 'true' ? '--provenance' : '--provenance=false');
            if (dryRun) cmd.push('--dry-run');
            console.log(`${name}@${version}: npm ${cmd.join(' ')}`);
            try {
                // A tarball publishes from anywhere; a staged dir from inside it (npm
                // resolves package files against the cwd).
                execFileSync('npm', t.bundle ? cmd.filter((a) => a !== target) : cmd, { cwd: t.bundle ? target : root, stdio: ['ignore', 'inherit', 'pipe'] });
                if (!dryRun) done.push(k);
            } catch (err) {
                const stderr = String(err.stderr || '');
                process.stderr.write(stderr);
                // npm view lags a fresh publish (staged publishing): a version it
                // did not show yet may already be there. That is not a failure.
                if (/cannot publish over the previously published versions/i.test(stderr)) {
                    console.log(`${name}@${version}: already on npm (registry view lagged) — skipping`);
                    continue;
                }
                console.error(`${name}@${version}: publish FAILED`);
                failed++;
            }
        }
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
    console.log(`published=${done.join(',')}`);
    process.exit(failed ? 1 : 0);
}

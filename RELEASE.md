# Releasing canvas-cli

Everything in this repo releases by **version bump + push to `main`**. CI never
bumps versions; `release.yml` does the rest on every push.

## The CLI

```bash
pnpm run release patch        # or minor / major; --dry-run prints the plan
```

`scripts/release.sh` bumps `package.json`, commits `canvas-cli <version>` and
pushes `main`. `release.yml` then, because no `v<version>` Release exists yet:

1. builds the five bun-compiled binaries (`pnpm run build:all`, cross-compiled
   on one Linux runner) and verifies them (`scripts/verify-binaries.sh`: right
   architecture, plausible size, and the Linux one starts and reports the
   version) — the same checks `ci.yml` runs on every PR;
2. creates the `v<version>` tag + GitHub Release with `canvas-linux`,
   `canvas-linux-arm`, `canvas-macos`, `canvas-macos-arm`,
   `canvas-windows.exe` and `SHA256SUMS` — what `scripts/install.sh`,
   `install.ps1` and `canvas update` download;
3. publishes `@augmentd-labs/canvas-cli@<version>` to npm.

Watch it: `gh run list --workflow=release.yml --limit 1`.

## The packages (`packages/*`)

`cli-host` (extension SDK) and the lazily installed `cli-mirror`,
`cli-server`, `cli-desktop` release the same way: bump the version in their
`package.json`, push. `scripts/publish-npm.mjs` publishes every version npm
does not have yet; the lazy packages are esbuild-bundled into one file each
(the compiled CLI cannot resolve bare imports from an external file).
`canvas update` / `canvas package update` pick them up from npm's `latest`.

A CLI change that needs a newer `cli-host` bumps both; the CLI pins the exact
`cli-host` version it was packed with.

## npm auth

Trusted publishing: each package on npmjs.com names `canvas-ui/canvas-cli`
and the workflow file `release.yml`. GitHub OIDC replaces any token and every
version carries provenance. Renaming `release.yml` breaks publishing until
the npm settings follow. A brand-new package has to be published once by
hand (`node scripts/publish-npm.mjs <name>` with a token) before its trusted
publisher can be configured.

## Testing an install locally

```bash
pnpm run build:linux
bash scripts/install.sh --dir /tmp/canvas-test --no-prompt && /tmp/canvas-test/canvas --version
```

## Pulling a bad release

```bash
npm deprecate @augmentd-labs/canvas-cli@2.9.1 "broken, use 2.9.2"
```

Unpublishing is only possible within 72 hours and breaks anyone who installed
in the meantime — prefer deprecation and ship a fixed patch. On GitHub, mark
the Release as a pre-release (installers and `canvas update` then skip it) or
delete it together with its tag.

Releases up to 2.9.0 were cut from the monorepo (`cli-v*` tags on
canvas-ui/canvas-common); `canvas update` still parses those tags.

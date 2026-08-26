# Canvas CLI Release Guide

Releases are cut locally. CI builds and publishes from the tag; it never
bumps a version and never writes to `main`.

## The whole thing

From the stack root, ship whatever actually moved (CLI included if its code
changed since the last `cli-v*` tag):

```bash
./canvas-release.sh
./canvas-release.sh --apps cli --bump minor
```

From the monorepo root, one app:

```bash
npm run release:cli -- --bump patch     # or minor / major
```

That bumps `apps/cli/package.json`, commits it, pushes `main`, pushes the tag
`cli-v<version>`, and stops. Everything after that happens in
`.github/workflows/release.yml`.

If the version is already what you want, drop `--bump` and it just tags.
`--if-needed` (what `canvas-release.sh` passes) skips the app when nothing
shippable moved, and patch-bumps when the current version is already tagged.

Markdown is excluded from the "did it move?" check: editing a README does not
cut a release. A commit that touches both docs and code still does.

Useful flags on the per-app script: `--no-push` / `--dry-run` print what would
happen; `--allow-dirty` skips the clean-tree check (hacking only).

## What CI does with the tag

The `cli` job in `.github/workflows/release.yml`:

1. **Asserts** `cli-v<X>` matches `apps/cli/package.json`. A stray tag fails
   here rather than publishing mislabeled artifacts.
2. **Builds five binaries** — bun cross-compiles every target from one Linux
   runner: `canvas-linux`, `canvas-linux-arm`, `canvas-macos`,
   `canvas-macos-arm`, `canvas-windows.exe`.
3. **Verifies them** (`scripts/verify-binaries.sh`): each file exists, is
   larger than 10 MB, and has the right architecture (`file`), and the native
   `canvas-linux` actually runs `--version` / `--help` and reports the tag's
   version. A binary that doesn't start never reaches a Release. `ci.yml` runs
   the same build and the same script on every PR, so a broken target shows up
   in review instead of during a release.
4. **Writes `SHA256SUMS`** over all five.
5. **Creates the GitHub Release** for the tag with the binaries attached.
6. **Publishes to npm**, in dependency order, skipping any version already on
   the registry: `@augmentd-labs/canvas-protocol` →
   `@augmentd-labs/canvas-schemas` → `@augmentd-labs/canvas-api-client` →
   `@augmentd-labs/canvas-cli`.

npm publishing runs *after* the GitHub Release on purpose: a registry outage
costs you the npm publish, never the binaries. Re-run the job once npm is back
— the skip-if-published check makes it safe to repeat.

Watch it: `gh run list --workflow=release.yml --limit 1`. A pushed `cli-v*`
tag with no matching Release means the job failed or never ran — check before
telling anyone the version is out.

## What the installers depend on

`scripts/install.sh` (Linux/macOS) and `scripts/install.ps1` (Windows) are the
`curl | bash` / `irm | iex` entry points documented in the README. They are
served straight from `main` over `raw.githubusercontent.com`, so a change to
either is live the moment it lands on `main` — there is no separate publish
step, and no version pinning for the installer itself.

They make three assumptions about a release; break any of them and every fresh
install breaks with it:

- **Asset names are exact and unarchived** — `canvas-linux`,
  `canvas-linux-arm`, `canvas-macos`, `canvas-macos-arm`,
  `canvas-windows.exe`. No tarballs, no version in the filename.
- **`SHA256SUMS` is attached** and lists those names. The installers verify
  against it and abort on mismatch (they warn and continue if the file is
  missing, so a release without it silently loses that check).
- **The newest `cli-v*` tag is the one to install.** This is a monorepo with a
  single release feed carrying `cli-v*`, `web-v*`, `extension-v*` and
  `desktop-v*`, so `/releases/latest` is usually *not* a CLI release — the
  installers list releases and take the first `cli-v*`. Don't "simplify" that
  back to `latest`.

Smoke-test after a release:

```bash
bash apps/cli/scripts/install.sh --dir /tmp/canvas-test --no-prompt && /tmp/canvas-test/canvas --version
```

`scripts/update-prompt.sh` is fetched from `main` the same way by
`install.sh --prompt`.

## Versions and names

The version lives in **one** place: `apps/cli/package.json`. Nothing else
carries it; `--version` reads it at runtime.

The npm package is **`@augmentd-labs/canvas-cli`** — the unscoped `canvas-cli`
name belongs to an unrelated package on npmjs. This affects the install
command only. The binary is still `canvas`, and the `client/app/canvas-cli`
protocol identifiers are unchanged.

```bash
npx @augmentd-labs/canvas-cli
npm install -g @augmentd-labs/canvas-cli
```

The npm package ships **only the `canvas` command**, via `publishConfig.bin`.
The other six (`context`, `ctx`, `dot`, `ws`, `agent`, `hi`) are too generic to
put on a global PATH silently; they remain available in the standalone
binaries (as wrappers written by `install.sh`) and in local development.

The three `packages/*` dependencies are published because the CLI depends on
them — `pnpm` rewrites `workspace:*` to real versions when it packs, so those
versions must exist on the registry before the CLI lands. They bump far less
often than the CLI, which is why the publish loop skips versions already there.

## One-time setup

Publishing needs an **`NPM_TOKEN`** repository secret — a granular token with
publish rights on the `@augmentd-labs` scope. **It is not set today**, so the
publish step logs a warning and skips; the GitHub Release with the binaries
still succeeds and the job stays green. Add the secret and the next `cli-v`
tag publishes with no workflow change. None of the four packages are on npmjs
yet, so the first publish creates all of them.

Once all four packages exist on npmjs, switch each to **Trusted Publishing**
(OIDC) in its npmjs settings and delete the secret; the `id-token: write`
permission the job already has is all that needs. Publishes are attested with
provenance either way.

## Not automated yet

- **Code signing** for macOS and Windows binaries. Downloads trip Gatekeeper
  and SmartScreen today, and the installers say so.
- **Homebrew tap / Scoop manifests.** Cheap to add on top of the existing
  release assets when there's demand.
- **Changelog generation.** `.changeset/` exists but nothing consumes it;
  versions are bumped by the release script.

## Rollback

npm forbids republishing a version, so **roll forward**: fix, `--bump patch`,
release again. `npm deprecate` warns people off a bad version:

```bash
npm deprecate @augmentd-labs/canvas-cli@2.1.9 "broken, use 2.1.10"
```

Unpublishing is only possible within 72 hours and breaks anyone who installed
in the meantime — prefer deprecation.

For the GitHub side, mark the release as a pre-release to bury it, or delete
the tag if it was never consumed:

```bash
git tag -d cli-v2.1.9 && git push origin :refs/tags/cli-v2.1.9
```

Deleting a `cli-v*` tag that *was* the newest one also changes what a fresh
`install.sh` run resolves to — the installer then picks the next `cli-v*`
release down the feed.

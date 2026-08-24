# Canvas CLI Release Guide

Releases are driven from the monorepo root by `scripts/update-releases.sh`.
CI does the building and publishing; you only decide the version.

## The whole thing

```bash
# from the monorepo root, on a clean main
npm run release:cli -- --bump patch     # or minor / major
```

That bumps `apps/cli/package.json`, commits it, pushes `main`, pushes the tag
`cli-v<version>`, and stops. Everything after that happens in
`.github/workflows/release.yml`.

If the version is already what you want, drop `--bump` and it just tags.

**You usually don't need to run anything at all.** `auto-release.yml` runs the
same script on every push to `main` with `--autobump`: if `apps/cli/**` — or a
`packages/*` workspace package the CLI depends on — changed since the last
`cli-v` tag, it patch-bumps `apps/cli/package.json`, commits it, tags, and
releases. Merge CLI work to `main` and the binaries publish themselves.

Use `--bump minor|major` explicitly when the change deserves more than a patch;
an explicit `--bump` always wins over the auto-bump.

The auto-bump commit is pushed to `main`, which re-runs `auto-release.yml`
once. That second run finds nothing changed since the new tag and stops — no
loop. Only the CLI opts in, via `AUTOBUMP_APPS` in `scripts/update-releases.sh`
(desktop would fire a 3-OS Tauri build on every touch; web republishes its
branch every push regardless of version).

Useful flags: `--no-push` prints what would happen and stops; `--allow-dirty`
skips the clean-tree check (hacking only).

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
   the registry:
   `@augmentd-labs/canvas-protocol` → `canvas-schemas` → `canvas-api-client` →
   `@augmentd-labs/canvas-cli`.

npm publishing runs *after* the GitHub Release on purpose: a registry outage
costs you the npm publish, never the binaries. Re-run the job once npm is back
— the skip-if-published check makes it safe to repeat.

Watch it: `gh run list --workflow=release.yml --limit 1`

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
binaries and in local development.

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
  and SmartScreen today.
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

## Legacy

`scripts/release.sh` and `scripts/cleanup-releases.sh` in this directory are
leftovers from when the CLI lived in its own repository. They describe a flow
that no longer exists — do not use them.

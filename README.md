<p align="center">
  <img src="https://raw.githubusercontent.com/canvas-ai/.github/main/banners/canvas-banner_1200x480.jpg" alt="Canvas" width="100%" />
</p>

# Canvas CLI

A command-line interface for managing Canvas workspaces, contexts, dotfiles and
documents with integrated AI assistance.

## Install

### One-liner (Linux / macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/canvas-ui/canvas/main/apps/cli/scripts/install.sh | bash
```

This resolves the newest `cli-v*` GitHub Release, downloads the single-file
binary for your platform, verifies it against the release's `SHA256SUMS`,
installs it to `~/.local/bin/canvas` together with the shortcut wrappers
(`ws`, `ctx`, `context`, `dot`, `agent`, `ag`, `hi`) and offers to wire the shell
prompt integration into your rc file.

No runtime is required — the binaries are bun-compiled and self-contained.

Flags can be passed through the pipe:

```bash
# Non-interactive, prompt integration wired into ~/.bashrc (or ~/.zshrc)
curl -fsSL .../install.sh | bash -s -- --prompt

# Pin a version, install elsewhere, skip the extras
curl -fsSL .../install.sh | bash -s -- --version 2.1.13 --dir ~/bin --no-prompt --no-shortcuts
```

| Flag | Effect |
| --- | --- |
| `--version <ver>` | Install a specific release (`2.1.11` or `cli-v2.1.11`) |
| `--dir <path>` | Install directory (default `~/.local/bin`, or `$CANVAS_INSTALL_DIR`) |
| `--prompt` / `--no-prompt` | Wire / skip the prompt integration without being asked |
| `--no-shortcuts` | Install only `canvas` |
| `--local [dir]` | Dev install: wrappers around a source checkout (see below) |

Run `scripts/install.sh` again at any time to upgrade in place.

### One-liner (Windows)

```powershell
irm https://raw.githubusercontent.com/canvas-ui/canvas/main/apps/cli/scripts/install.ps1 | iex
```

Installs `canvas.exe` into `%LOCALAPPDATA%\Programs\canvas`, writes `.cmd`
shims for the shortcuts and adds the directory to your user PATH.

### Manual binary download

Every `cli-v*` release attaches single-file binaries, downloaded as-is, not
archived:

| Platform | Architecture | Asset |
| --- | --- | --- |
| **Linux** | x64 | `canvas-linux` |
| **Linux** | ARM64 | `canvas-linux-arm` |
| **macOS** | x64 | `canvas-macos` |
| **macOS** | ARM64 (Apple Silicon) | `canvas-macos-arm` |
| **Windows** | x64 | `canvas-windows.exe` |

Grab them from the [releases page](https://github.com/canvas-ui/canvas/releases?q=cli-v)
— the repository is a monorepo, so look for a tag starting with `cli-v`, not
just "latest".

```bash
sha256sum -c SHA256SUMS --ignore-missing   # every release ships SHA256SUMS
chmod +x canvas-linux
mv canvas-linux ~/.local/bin/canvas
```

macOS and Windows binaries are **not code-signed yet**, so Gatekeeper and
SmartScreen will warn on first run.

### npm

```bash
npx @augmentd-labs/canvas-cli              # one-off
npm install -g @augmentd-labs/canvas-cli   # installs the `canvas` command
```

The unscoped `canvas-cli` name on npmjs is an unrelated package — use the
scoped name. The npm package installs only the `canvas` command; the shortcuts
(`ctx`, `context`, `dot`, `ws`, `agent`, `ag`, `hi`) ship with the standalone
binaries and the source install. Node.js v20 LTS or newer.

### From source (development)

```bash
git clone https://github.com/canvas-ui/canvas ~/Code/canvas
cd ~/Code/canvas/apps/cli
pnpm install                 # from the monorepo root

# Wrappers in ~/.local/bin pointing at this checkout (bun if present, else node)
scripts/install.sh --local

# …or run it directly
node bin/canvas.js --help
```

`--local` writes small `exec`-wrappers, so edits to the checkout take effect
immediately without reinstalling.

## Shell prompt integration

`scripts/update-prompt.sh` prefixes your prompt with the Canvas connection
state and the bound context URL:

```
[● (work) admin@dev://universe://work/reports] user@host:~$
```

The dot is **green** when the bound remote last answered, **red** when it is
unreachable or nothing is bound, and **yellow** when a remote is bound but
nothing has verified it yet. That state is written by `canvas remote bind`,
`canvas remote ping` and `canvas context bind`; a server that answers with an
error still counts as reachable.

The context URL is read from `~/.canvas/config/cli-session.json` and refreshed
from the server at most every 30 seconds (`CANVAS_CONTEXT_UPDATE_TIMEOUT`),
with a 0.5s timeout so a dead remote never stalls your prompt.

The installer sets this up for you (`--prompt`). Manually:

```bash
mkdir -p ~/.canvas/scripts
curl -fsSL https://raw.githubusercontent.com/canvas-ui/canvas/main/apps/cli/scripts/update-prompt.sh \
  -o ~/.canvas/scripts/update-prompt.sh

# ~/.bashrc or ~/.zshrc
[ -f "$HOME/.canvas/scripts/update-prompt.sh" ] && . "$HOME/.canvas/scripts/update-prompt.sh"
```

It hooks `PROMPT_COMMAND` on bash and `precmd_functions` on zsh, keeping your
existing `PS1` intact behind the status block. Colour codes are marked
non-printing, so line editing and wrapping stay correct.

Requires `jq` and `curl`; without `jq` the script leaves your prompt untouched.
There is no PowerShell equivalent yet.

## Usage

```bash
canvas --help
```

### The grammar

One shape, at every level:

```
canvas <module> [<resource>] [<noun>] <verb> [<term>…] [--flags]
```

```bash
ctx note add "buy milk" --title Groceries    # noun, then verb
ctx note list
ctx notes                                    # plural noun == "<noun> list"
ctx note rm <docId>                          # unlink from this context
ws universe file list                        # same grammar, workspace scope
ws universe note add ./notes.md --title X
ag lucy sessions                             # and for agents
```

Three rules cover the rest:

- **A plural noun lists it.** `ctx notes` is `ctx note list`, at any depth.
- **`rm` unlinks, `delete` destroys.** `ctx note rm <id>` drops the document
  from this context and leaves it in the workspace; `ctx note delete <id>`
  destroys it and demands `--force`.
- **An address beats a noun, a noun beats a resource.** `ctx note list` is the
  note noun even if you own a context called `note` — address that one as
  `ctx user@remote:note`.

`--help` works at every level and prints the usage line for what you asked
about: `canvas ws --help`, `canvas ctx note --help`, `canvas ctx note add --help`.

### Modules

| Module | Aliases | What it does |
| --- | --- | --- |
| `workspace` | `ws` | Manage workspaces |
| `context` | `ctx` | Manage contexts |
| `agent` | `ag`, `hi` | Manage agents and prompt them |
| `remote` | `remotes` | Manage remote Canvas servers |
| `dot` | | Workspace-backed dotfile manager (per-device link map) |
| `role` | `ag-role` | Container/role orchestration (placeholder) |
| `auth` | | Authentication & API tokens |
| `alias` | | Resource aliases |
| `config` | `cfg`, `settings` | CLI configuration |
| `server` | | Manage a local Canvas server (PM2) |

The `ws`, `ctx`, `context`, `dot`, `agent`, `ag` and `hi` binaries are standalone
shortcuts for their module. `ag` and `hi` are the same thing — two spellings of
`canvas agent`, kept until usage settles on one.

```bash
# Workspaces and contexts
canvas ws list                 # or: canvas workspaces
canvas ws universe             # a named resource shows itself
canvas ctx bind <context>
canvas ctx                     # the bound context
canvas contexts

# Config (list | show | get | set | delete | edit | validate)
canvas config get server.url
canvas config set server.url http://127.0.0.1:8001
```

### Nouns

A noun is a document schema, so the vocabulary is the same one the web and the
server use. Both `ctx` and `ws` carry the full set:

| Noun | Plural | Schema | Verbs |
| --- | --- | --- | --- |
| `note` | `notes` | `data/schema/note` | list, add, get, rm, delete |
| `tab` | `tabs` | `data/schema/tab` | list, add, get, rm, delete |
| `todo` (`task`) | `todos` | `data/schema/task` | list, add, get, rm, delete |
| `link` | `links` | `data/schema/link` | list, add, get, rm, delete |
| `file` | `files` | `data/schema/file` | list, add, upload, index, get, rm, delete |
| `email` | `emails` | `data/schema/message/email` | list, get, rm, delete |
| `identity` | `identities` | `data/schema/identity` | list, get, rm, delete |
| `dotfile` | `dotfiles` | `data/schema/dotfile` | list, get (writes belong to `canvas dot`) |
| `doc` | `docs` | *any* | list, get, rm, delete |

```bash
ctx todo add "ship the refactor" --due 2026-09-01T09:00:00Z --task-priority 2
ctx tab add https://example.com --title "Example"
ctx link add git+ssh://git@github.com/canvas-ui/canvas --title monorepo
ctx file add ./report.pdf        # uploads the bytes (embeddable)
ctx file index ~/Photos          # records a device pointer, bytes stay put
ws work note add "meeting recap" --path notes:/standup
ctx doc list --feature data/schema/event    # any schema, by feature
```

Lists are rendered per schema — a note shows its preview and tags, a file its
size, type and whether the bytes are `stored` or on a `device:<id>`, a todo its
status, due date and priority. `-f json` always carries the whole document,
`-f csv` the same columns unclipped.

### AI assistance

```bash
# Prompt an agent (the default verb, so it can be elided)
hi lucy "whats the weather today"
canvas agent lucy "any new PRs to review?"

# Pipe stdin into the prompt
tail -n500 /var/log/syslog | hi linus "any idea what those ACPI errors are?"

# Conversations
ag lucy sessions                        # * marks the one it is talking in
ag lucy session new "refactor spike"
ag lucy session use <sessionId>
hi lucy --session <sessionId> "back to this one"

# What can it actually do?
ag lucy tools                           # tools the runtime exposes to it
ag lucy skills
ag lucy skill add ./my-skill            # a path or URL, or --name for inline

# Workspace-bound queries
canvas ws work agent prompt lucy "any new emails for this customer?"
hi lucy --workspace work --context foo "draft a reply please"
```

### Remotes

Remotes are identified as `user@remote-name`. The first remote added becomes
the default; `bind` switches between them.

```bash
canvas remote add idnc_sk@canvas https://canvas.idnc.sk    # prompts for login if no --token
canvas remote add admin@dev http://127.0.0.1:8001 --token <api-token>
canvas remotes                                              # list remotes
canvas remote bind admin@dev
```

### Output formats

Lists accept `-f, --format` with `table` (default), `json` or `csv`; `-r, --raw`
dumps the raw API JSON. Tables show the columns that matter for what you asked
about and clip long values; `json` is always the complete record, and `csv`
carries the table's columns unclipped with ISO timestamps.

```bash
canvas ws list -f json
canvas ctx notes -f csv
canvas ctx note get <docId>       # one record, down the page
```

## Configuration

The CLI keeps its state in `~/.canvas/` (`%USERPROFILE%\Canvas\` on Windows,
overridable with `CANVAS_USER_HOME`):

| File | Contents |
| --- | --- |
| `config/cli.json` | General settings (`canvas config list \| get \| set \| edit`) |
| `config/remotes.json` | Registered remotes with their URLs and auth tokens — managed via `canvas remote add \| bind \| rename`, not by hand |
| `config/cli-session.json` | The current session: bound remote and its status, bound context and URL |
| `config/cli-aliases.json` | User-defined command aliases (`canvas alias`) |
| `scripts/update-prompt.sh` | Prompt integration, if installed |

AI prompts (`hi`, `canvas agent`) run against agents hosted on the bound Canvas
server — model/provider configuration lives server-side, not in the CLI.

## Releasing

See [RELEASE.md](RELEASE.md).

## Licence

Copyright (C) 2024-2026 Jozef Melich.

Canvas CLI is licensed under the **[AGPL-3.0-or-later](LICENSE)** and under no
other terms. No commercial exemption is offered for this component, to anyone.
The Canvas clients stay free software in all cases.

Contributing needs no CLA here, only a DCO sign-off (`git commit -s`). See
[CONTRIBUTING.md](CONTRIBUTING.md). The dual-licensed Canvas components are
listed in [NOTICE](NOTICE).

---
This project is funded by [Augmentd Labs](https://augmentd.eu/en/labs)

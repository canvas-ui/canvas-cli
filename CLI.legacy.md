# CLI command-line shape (pre-refactor)

Snapshot of how **`canvas-cli`** parses argv and dispatches today. Entry: `src/index.js` → `main(argv)` (minimist). Subcommands are **positional** `args[0]`, `args[1]`, … with flags in `options`.

## Entry points

| Invocation | Effect |
|------------|--------|
| `canvas` / `node bin/canvas.js` | Full command: `canvas <cmd> …` |
| `ws` / `bin/ws.js` | Prepends `workspace`: same as `canvas workspace …` |
| `context` / `ctx` / `bin/context.js` / `bin/ctx.js` | Prepends `context` |
| `q` / `bin/q.js` | Prepends `q` |
| `dot` / `bin/dot.js` | Prepends `dot` |
| `agent` / `bin/agent.js` | Prepends `agent` |

## Global parsing (minimist)

- **Positional:** `argv._[0]` = command name; `_.slice(1)` = per-command args.
- **String options (typed):** `context`, `workspace`, `format`, `title`, `tag`, `schema`, `connector`, `model`, `template`, `max-tokens`, `priority`.
- **Boolean flags:** `help`, `version`, `raw`, `verbose`, `debug`, `code`, `quiet`, `show-prompt`, `show-prompt-only`, `update-dotfiles`, `encrypt`, `force`.
- **Aliases:** `-h/--help`, `-v/--version`, `-c/--context`, `-w/--workspace`, `-f/--format`, `-t/--title`, `-s/--schema`, `-r/--raw`, `-d/--debug`, `-q/--quiet`, `-u/--update-dotfiles`, `-e/--encrypt`, `-p/--priority`.
- **Stdin:** If stdin is not a TTY, full stdin is read into `parsed.data` (used by `q` for piped input).
- **`--debug` / `--verbose`:** sets `process.env.DEBUG = 'canvas:*'`.

## Command registry

| `argv._[0]` | Class | Notes |
|--------------|--------|--------|
| `workspace`, `ws`, `workspaces` | `WorkspaceCommand` | |
| `context`, `ctx`, `contexts` | `ContextCommand` | |
| `auth` | `AuthCommand` | |
| `config` | `ConfigCommand` | |
| `remote`, `remotes` | `RemoteCommand` | |
| `alias` | `AliasCommand` | |
| `q` | `QCommand` | Custom `execute` (no `BaseCommand` action router) |
| `dot` | `DotCommand` | Custom `execute` (kebab-case → `handleFooBar`) |
| `server` | `ServerCommand` | |
| `agent`, `agents` | `AgentCommand` | |

### Special cases in `main()`

- **`remotes` | `contexts` | `workspaces`** with **no** further args → inject `args = ['list']`.
- **`remote` | `workspace`** with **no** further args → inject `args = ['current']`.
- **`<cmd> --help`** (with known `cmd`): runs that command’s `showHelp()` if defined.

## Dispatch mechanics

### Default: `BaseCommand.execute`

1. `action = args[0] || defaultAction` (per-class).
2. Handler name: `handle` + PascalCase of action, with **single** kebab segment folded: `create-token` → `handleCreateToken` (`-([a-z])` → uppercase).
3. Unless `needsConnection` is false or action is in `skipConnectionFor`: **`await client.ping()`** (default remote, `GET …/ping` under API base).

### Exceptions

- **`WorkspaceCommand`:** If `args[0]` is **not** a known action, treat it as **workspace id** and `args[1]` as action (default `show`). Example: `canvas ws universe tree` → `handleTree` with workspace `universe`.
- **`ContextCommand`:** All actions via `BaseCommand` (no workspace-style shim).
- **`QCommand`:** `args[0]` is `status` | `templates` | `help`, else entire `args` joined = query text.
- **`DotCommand`:** `args[0]` is subcommand; **multiple** kebab parts → camel handler, e.g. `install-hooks` → `handleInstallHooks`.

## Resource addresses

Used by `client.resolve()` for workspace/context ids:

- **`user@remote:resource`** — parsed by `parseResourceAddress` (`src/utils/address-parser.js`).
- **Bare id / alias** — resolved with **default remote** from session (`cli-session.json` `boundRemote`).

Session fields touched by commands: `boundRemote`, `boundContext`, `boundContextUrl`, `boundContextId`, `boundAt`, `boundRemoteStatus`, etc.

## Per-command surfaces

### `workspace` / `ws` / `workspaces`

| Action | Positional shape | Notable flags / options |
|--------|------------------|-------------------------|
| `list` | `list` | Uses cache + optional sync; skips ping |
| `current` | `current` | Reads session / context |
| `show` | `show <address>` | |
| `create` | `create <name>` | `--label`, `--description`, `--type`, `--color`, `--metadata` (JSON string) |
| `update` | `update <address>` | `--label`, `--description`, `--color`, `--metadata` |
| `delete` | `delete <address>` | `--force` |
| `start` / `stop` / `status` | `<action> <address>` | |
| `tree` | `tree <address>` | |
| `documents` | `documents <address> [search]` | `--feature`, `--filter`, `--context-path`, `--tree` → API `allOf`, `filters`, `context`, `treeNameOrTreeId` |
| `dotfiles` / `tabs` / `notes` | `<action> <address>` | Fixed abstraction filters |

**Shorthand:** `canvas ws <id> <action> …` when first token is not a known action name.

`defaultAction` if no args: **`list`** (except `workspaces` plural injection also yields `list`).

---

### `context` / `ctx` / `contexts`

| Action | Positional shape | Notes |
|--------|------------------|--------|
| `current` | `current` | **Default** when no args (singular `context` does not inject; empty → `current` via `defaultAction`) |
| `list` | `list` | Skips ping |
| `show` | `show [id]` | Uses `-c/--context` or session |
| `create` | `create <id> [url]` | `--description`, `--color` (into metadata) |
| `destroy` | `destroy <addr>` | |
| `update` | `update <id>` | `--description`, `--metadata` (JSON) |
| `bind` / `switch` | `bind <addr>` | Updates session |
| `set` | `set <url>` | Current context |
| `url` / `path` / `baseUrl` | `[id]` optional | |
| `paths` | `paths [id]` | Prints path lines from tree |
| `tree` | `tree [id]` | |
| `workspace` | `workspace [id]` | Prints URL scheme (e.g. `universe`) |
| `documents` | `documents` or `documents <addr> [q]` or `documents <search>` | Heuristic: if first arg has `@` or `:`, it’s address |
| `dotfiles` / `dot` | `[id]` | |
| `tabs` / `tab` | `tab [list\|add\|get\|delete\|remove] …` | `add`/`get`/ops take further args |
| `notes` / `note` | same pattern | |
| `document` | `document get\|delete\|remove …` | |

---

### `auth`

| Action | Shape | Flags |
|--------|-------|--------|
| `login` | `login <email>` | `--password`, or `--username` / `--email` |
| `logout` | `logout` | |
| `profile` | `profile` | |
| `status` | `status` | No ping (`skipConnectionFor`) |
| `tokens` | `tokens` | |
| `create-token` | `create-token <name>` | `--name`, `--description`, `--save` |
| `delete-token` | `delete-token <id>` | `--force` |
| `set-token` | `set-token <token>` | `--token`; skips ping for this action |

Token is stored in **Conf** (`server.auth.token`) and, when `boundRemote` is set, mirrored onto **remote** `auth.token` (see `remotes.json`).

`defaultAction`: **`status`**.

---

### `config`

Local **Conf** file only (`config.path`). Actions: `show [key]`, `get <key>`, `set <key> <value>`, `delete <key>`, `list`, `reset`, `edit`, `path`, `validate`. JSON values for `set` if parse succeeds. `--force` for `delete` / `reset`. `get` honors `--raw`.

`needsConnection`: **false**. `defaultAction`: **`show`**.

---

### `remote` / `remotes`

| Action | Shape | Flags |
|--------|-------|--------|
| `add` | `add <user@remote> <url>` | `--token`, `--apiBase` (default `/rest/v2`) |
| `list` | `list` | |
| `remove` | `remove <id>` | `--force` |
| `sync` | `sync [id]` | no id → sync all remotes |
| `ping` | `ping <id>` | |
| `bind` | `bind <id>` | |
| `login` | `login <id>` | `--token`, `--email`, `--password` |
| `logout` | `logout <id>` | |
| `rename` | `rename <old> <new>` | |
| `show` | `show <id>` | |
| `current` | `current` | Injected when `canvas remote` with no args |

`needsConnection`: **false**.

---

### `alias`

`list`, `set <name> <address>`, `get <name>`, `update <name> <address>`, `remove <name>`. `--force` on set/remove flows where implemented.

`needsConnection`: **false**. Default action via base: **`list`** if no args.

---

### `q` (AI)

- `q status` — connector status (local config / env).
- `q templates` — template list.
- `q help` / `--help` — help.
- Otherwise: **`q <words…>`** = single query; optional stdin + `parsed.data` switches template to `data-analysis`.
- Uses `-c/--context` to fetch Canvas context for prompt variables when possible.

Options: `--connector`, `--model`, `--template`, `--max-tokens`, `--code`, `--raw`, `--quiet`, `--show-prompt`, `--show-prompt-only`, `--priority`.

Does **not** use `BaseCommand.execute` → **no** pre-flight `ping`.

---

### `dot`

Subcommands as in `showHelp()` (see `src/commands/dot.js`): `list`, `init`, `sync`, `add`, `commit`, `push`, `pull`, `status`, `activate`, `deactivate`, `restore`, `encrypt`, `decrypt`, `remove`, `delete`, `install-hooks`, `cd`, `clone`, … (handlers exist for each). Kebab-case maps to `handleInstallHooks` etc.

Custom `execute` → **no** automatic `ping`.

---

### `server`

Actions: `start`, `stop`, `restart`, `status`, `logs`. `--lines` for logs.

Uses `super.execute` → **does** `ping` when `needsConnection` true (default). There is **no** `handleList`; **`canvas server` with no subcommand** resolves to default action `list` and prints **Unknown action** — use e.g. `canvas server status`.

---

### `agent` / `agents`

| Action | Shape |
|--------|--------|
| `list` | default |
| `show` | `show <id\|name>` |
| `status` | `status <id\|name>` |
| `prompt` | `prompt <id\|name> <message words…>` |

---

## Output flags (shared)

Commands using `BaseCommand.output()` respect **`--format`** (`table` \| `json` \| `csv`) and **`--raw`** (from global minimist). Workspace/context/remote formatters use session when relevant.

## Version

`src/index.js` exports `VERSION = '2.0.0-alpha'` (may drift from `package.json`).

---

*This file describes behaviour as implemented in source; it is not user-facing install docs.*

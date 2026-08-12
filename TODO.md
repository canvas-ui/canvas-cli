# TODO

## Dotfile encryption (`dot` module; moved from canvas-server dotfile service TODO)

Ref: https://chatgpt.com/c/6886b6b2-a264-832f-8906-2bf6d7741bec

The server-side dotfile service ships the git hooks (`.dot/hooks/`, `install-hooks.sh`,
`encrypted.index`) — the CLI half is missing:

- `dot install-hooks` — run the shipped installer so 90% of users never execute the
  script manually.
- `dot add ~/.bashrc user@remote:workspace/shell/bashrc --encrypt` — register
  `shell/bashrc` in `.dot/encrypted.index` (paths relative to repo root),
  auto-gitignore the decrypted versions.
- `dot encrypt <file>` / `dot decrypt <file>` — auto-update the index so it stays
  consistent. Make the whole flow as transparent to the user as possible.
- [ ] FIX FIRST: the shipped hook scripts in canvas-server
      (`src/core/workspace/services/dotfile/files/.dot/`) are broken end-to-end —
      `openssl enc -aes-256-gcm` fails at runtime (enc rejects AEAD modes; pick
      aes-256-cbc + HMAC or use `openssl pkeyutl`/age), and the `'\\.encrypted$'`
      grep patterns are double-escaped so they never match real `*.encrypted` files.

- Auto-install ./scripts/update-prompt.sh on *nix
- Fix BUN icons
- Fix windoze builds
- Detect if canvas-ui (electron) socket exists in ~/.canvas/var/canvas-ui.sock or its named pipe alternative so that $ cat some/app.log | grep -i foo | awk .. | hi lucy "can you please help me analyze this thing" --canvas foo # shows the analysis in the UI in an existing or a new canvas(ag2ui or similar setting)
- Bash integration with 2 modes of operation:
  - Explorer/Workspace mode: Freely browse all workspaces and workspace-exported context and directory trees
  - Comntext mode: Bound to a specific context, only shows relevant data of the context

## Main modules

- `canvas workspace`, alias `canvas ws`, command alias `ws`
  - Subcommands:
    - bind
- `canvas role`: # Docker/container based role orcherstration
- `canvas remote`: Might get merged with `device`
- `canvas device`:
- `canvas settings`, alias `canvas config` and `canvas cfg`
  - Subcommands:
    - list|show configName
    - set configName var.path
    - get configName var.path
    - test configName

## Utilities

- `canvas repl` ? `canvas shell`
- `canvas shx`, command alias `shx`
  - Subcommands:
    - default shell.js/shx subcommands

## Aliases

- devices: device list

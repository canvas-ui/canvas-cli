# TODO

- Complete refactor of this vibe-coded mess!
- Modular, built on top of the battle-tested shell.js codebase
  - Data abstractions (notes, emails, chat messages, files etc) should have the logic in separate files/folders to keep the whole implementation easily extendible, not in one "god" class
- Auto-install ./scripts/update-prompt.sh on *nix
- Fix BUN icons
- Fix windoze builds
- Detect if canvas-ui (electron) socket exists in ~/.canvas/var/canvas-ui.sock or its named pipe alternative so that $ cat some/app.log | grep -i foo | awk .. | hi lucy "can you please help me analyze this thing" --canvas foo # shows the analysis in the UI in an existing or a new canvas(ag2ui or similar setting)
- Bash integration with 2 modes of operation:
  - Explorer/Workspace mode: Freely browse all workspaces and workspace-exported context and directory trees
  - Comntext mode: Bound to a specific context, only shows relevant data of the context

## Main modules

- `canvas`
- `canvas workspace`, alias `canvas ws`, command alias `ws`
  - Subcommands:
    - list
    - bind
- `canvas context`, alias `canvas ctx`, command alias `ctx`
  - Subcommands:
    - list
    - bind
- `canvas agent`, alias `canvas ag`, command alias `ag` and `hi`
  - Subcommands:
    - list
    - bind
  - Examples:
    - hi lucy "whats the weather today" 
    - hi carmack "any new PRs to review?"
    - ws work hi lucy "do we have any new emails for this customer?" # Workspace bound query
    - ctx hi lucy "draft a reply to that email from operations please" # Context bound query
    - tail -n500 /var/log/syslog | hi linus any idea what those ACPI errors are
- `canvas role`: # Docker/container based role orcherstration
- `canvas remote`: Might get merged with `device`
  - Subcommands:
    - list
    - bind
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

- contexts: ctx list
- workspaces: ws list
- agents: agent list
- roles: role list
- devices: device list
- remotes: remote list


### Remotes

Remote examples:

```
Remote #1:
URL: https://canvas.idnc.sk
User: me@idnc.sk
UserName: idnc_sk
Auth: {}
RemoteId: idnc_sk@canvas.idnc.sk
RemoteName: idnc_sk@canvas (or remoteAlias?)

Remote #2:
URL: https://canvas.idnc.sk
UserName: user2
Auth: {}
RemoteId: user2@canvas.idnc.sk
RemoteName: user2@canvas

Remote #3:
URL: http://127.0.0.1:8001
UserName: admin
Auth: {}
RemoteId: admin@127.0.0.1:8001
RemoteName: admin@dev 
```

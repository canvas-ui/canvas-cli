<p align="center">
  <img src="https://raw.githubusercontent.com/canvas-ai/.github/main/banners/canvas-banner_1200x480.jpg" alt="Canvas" width="100%" />
</p>

# Canvas CLI

A command-line interface for managing Canvas workspaces, contexts, dotfiles and documents with integrated AI assistance.

## Installation

### Method 1: Download Standalone Binary (Recommended)

**No dependencies required!** Each release attaches single-file binaries —
downloaded as-is, not archived:

| Platform | Architecture | Download |
| --- | --- | --- |
| **Linux** | x64 | [📦 canvas-linux](https://github.com/canvas-ui/canvas/releases/latest) |
| **Linux** | ARM64 | [📦 canvas-linux-arm](https://github.com/canvas-ui/canvas/releases/latest) |
| **macOS** | x64 | [📦 canvas-macos](https://github.com/canvas-ui/canvas/releases/latest) |
| **macOS** | ARM64 (Apple Silicon) | [📦 canvas-macos-arm](https://github.com/canvas-ui/canvas/releases/latest) |
| **Windows** | x64 | [📦 canvas-windows.exe](https://github.com/canvas-ui/canvas/releases/latest) |

Every release also ships `SHA256SUMS`; verify with
`sha256sum -c SHA256SUMS --ignore-missing`.

macOS and Windows binaries are **not code-signed yet**, so Gatekeeper and
SmartScreen will warn on first run.

```bash
# Manual installation (Linux/macOS)
chmod +x canvas-linux
mv canvas-linux ~/.local/bin/canvas

# (Optional) Install prompt update script
mkdir -p ~/.canvas/scripts
cp scripts/update-prompt.sh ~/.canvas/scripts/update-prompt.sh
chmod +x ~/.canvas/scripts/update-prompt.sh

# Add to bashrc
if [ -f $HOME/.canvas/scripts/update-prompt.sh ]; then
  . $HOME/.canvas/scripts/update-prompt.sh
fi;
```

`scripts/install.sh`, `install.ps1` and `install.bat` in this directory are
from the pre-monorepo layout and still expect the old standalone repository —
they need updating before the one-liner install is advertised again.

### Method 1b: npm

```bash
npx @augmentd-labs/canvas-cli          # one-off
npm install -g @augmentd-labs/canvas-cli   # installs the `canvas` command
```

The unscoped `canvas-cli` name on npmjs is an unrelated package — use the
scoped name. The npm package installs only the `canvas` command; the other
entry points (`ctx`, `context`, `dot`, `ws`, `agent`, `hi`) ship with the
standalone binaries.

### Method 2: Manual Install (Cross-Platform)

**Platform Requirements:**

- **Node.js**: v20 LTS or higher
- **Operating Systems**: Linux, macOS, Windows 10/11
- **Optional**: PM2 for local server management (`npm install -g pm2`)

#### Git clone this repository

`git clone https://github.com/canvas-ui/canvas ~/path/to/canvas` `cd ~/path/to/canvas/apps/cli`

#### Linux/Mac

```bash

# Create symlinks to your local bin directory
ln -sf $(pwd)/bin/canvas.js ~/.local/bin/canvas
ln -sf $(pwd)/bin/context.js ~/.local/bin/context
ln -sf $(pwd)/bin/ctx.js ~/.local/bin/ctx
ln -sf $(pwd)/bin/ws.js ~/.local/bin/ws
ln -sf $(pwd)/bin/dot.js ~/.local/bin/dot
ln -sf $(pwd)/bin/agent.js ~/.local/bin/agent
ln -sf $(pwd)/bin/hi.js ~/.local/bin/hi

# Make binaries executable
chmod +x bin/*

# Ensure ~/.local/bin is in your PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Install PM2 for server management (optional)
npm install -g pm2
```

#### Windows

```powershell
# Option 1: PowerShell (Run as Administrator)
# Add Canvas CLI bin directory to your PATH
$CanvasPath = (Get-Location).Path + "\bin"
[Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";$CanvasPath", [EnvironmentVariableTarget]::User)

# Restart your terminal for PATH changes to take effect
```

```batch
:: Option 2: Command Prompt (Run as Administrator)
:: Add Canvas CLI bin directory to your PATH
setx PATH "%PATH%;%CD%\bin"

:: Restart your terminal for PATH changes to take effect
```

```powershell
# Option 3: Development Environment
# For development, you can run directly:
node bin/canvas.js --help
node bin/context.js list
node bin/ws.js list
node bin/hi.js lucy "test query"
```

### Method 3: Global NPM Installation

```bash
# Install dependencies
npm install

# Link globally (works on all platforms)
npm link
```

This creates global symlinks:

- `canvas` → Canvas CLI main command
- `context`, `ctx` → Context management shortcuts
- `ws` → Workspace management shortcut
- `dot` → Dotfile Manager
- `agent`, `hi` → AI agent shortcuts

### Method 4: Direct Execution (Development)

```bash
# Linux/Mac
node bin/canvas.js --help
./bin/canvas.js workspace list

# Windows
node bin\canvas.js --help
```

## Usage

```bash
# Show help
canvas --help
```

### Commands

Functionality is organized into modules: `workspace` (alias `ws`), `context` (alias `ctx`), `agent` (aliases `ag`, `hi`), `role`, `remote`, `dot`, `auth`, `alias`, `server` and `config` (aliases `cfg`, `settings`). The `ws`, `ctx`, `context`, `hi`, `agent` and `dot` binaries are standalone shortcuts for their respective modules.

```bash
# Workspaces
canvas ws list
ws list                        # standalone shortcut

# Contexts
canvas ctx list
canvas ctx bind <context>

# Plural shortcuts expand to "<module> list"
canvas workspaces
canvas contexts
canvas agents
canvas roles
canvas remotes

# Config (list | show | get | set | delete | edit | validate)
canvas config show
canvas config get server.url
canvas config set server.url http://localhost:8001
```

### AI assistance

```bash
# Prompt an agent (default action, so no subcommand needed)
hi lucy "whats the weather today"
canvas agent lucy "any new PRs to review?"

# Pipe stdin into the prompt
tail -n500 /var/log/syslog | hi linus "any idea what those ACPI errors are?"

# Workspace-bound queries
canvas ws work agent prompt lucy "do we have any new emails for this customer?"
hi lucy --workspace work --context foo "draft a reply please"
```

### Remotes

Remotes are identified as `user@remote-name`. The first remote added becomes the default; `bind` switches between them.

```bash
canvas remote add idnc_sk@canvas https://canvas.idnc.sk    # prompts for login if no --token
canvas remote add admin@dev http://127.0.0.1:8001 --token <api-token>
canvas remotes                                              # list remotes
canvas remote bind admin@dev
```

### Output formats

List-style commands accept `-f, --format` with `table` (default), `json` or `csv`:

```bash
canvas ws list -f json
canvas contexts -f csv
```

## Configuration

The CLI keeps its state in `~/.canvas/config/`:

| File | Contents |
| --- | --- |
| `cli.json` | General settings (`canvas config list \| get \| set \| edit`) |
| `remotes.json` | Registered remotes with their URLs and auth tokens — managed via `canvas remote add \| bind \| rename`, not by hand |
| `cli-session.json` | The current session: bound remote, bound context, default workspace |
| `cli-aliases.json` | User-defined command aliases (`canvas alias`) |

AI prompts (`hi`, `canvas agent`) run against agents hosted on the bound
Canvas server — model/provider configuration lives server-side, not in the CLI.

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

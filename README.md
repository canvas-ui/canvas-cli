# Canvas CLI

A command-line interface for managing Canvas workspaces, contexts, dotfiles and documents with integrated AI assistance.

## Installation

### Method 1: Download Standalone Binary (Recommended)

**No dependencies required!** Download the latest release for your platform:

| Platform | Architecture | Download |
| --- | --- | --- |
| **Linux** | x64 | [📦 canvas-linux-x64.tar.gz](https://github.com/canvas-ai/canvas-cli/releases/latest) |
| **Linux** | ARM64 | [📦 canvas-linux-arm64.tar.gz](https://github.com/canvas-ai/canvas-cli/releases/latest) |
| **macOS** | x64 | [📦 canvas-macos-x64.tar.gz](https://github.com/canvas-ai/canvas-cli/releases/latest) |
| **macOS** | ARM64 (Apple Silicon) | [📦 canvas-macos-arm64.tar.gz](https://github.com/canvas-ai/canvas-cli/releases/latest) |

**Quick install with our script:**

```bash
# One-liner installation (Linux/macOS)
curl -sSL https://raw.githubusercontent.com/canvas-ai/canvas-cli/main/scripts/install.sh | bash

# (Optional) Install prompt update script
mkdir -p ~/.canvas/scripts
curl -sSL https://raw.githubusercontent.com/canvas-ai/canvas-cli/refs/heads/main/scripts/update-prompt.sh -o ~/.canvas/scripts/update-prompt.sh
chmod +x ~/.canvas/scripts/update-prompt.sh

# Add to bashrc
if [ -f $HOME/.canvas/scripts/update-prompt.sh ]; then
  . $HOME/.canvas/scripts/update-prompt.sh
fi; 

# Manual installation
tar -xzf canvas-*.tar.gz
chmod +x canvas-*
sudo mv canvas-* ~/.local/bin/canvas
```

### Method 2: Manual Install (Cross-Platform)

**Platform Requirements:**

- **Node.js**: v20 LTS or higher
- **Operating Systems**: Linux, macOS, Windows 10/11
- **Optional**: PM2 for local server management (`npm install -g pm2`)

#### Git clone this repository

`git clone https://github.com/canvas-ai/canvas-cli ~/path/to/canvas-cli` `cd ~/path/to/canvas-cli`

#### Linux/Mac

```bash

# Create symlinks to your local bin directory
ln -sf $(pwd)/bin/canvas.js ~/.local/bin/canvas
ln -sf $(pwd)/bin/context.js ~/.local/bin/context
ln -sf $(pwd)/bin/ws.js ~/.local/bin/ws
ln -sf $(pwd)/bin/q.js ~/.local/bin/q

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
node bin/q.js "test query"
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
- `context` → Context management shortcut
- `dot` → Dotfile Manager
- `q` → AI assistant shortcut
- `ws` → Workspace management shortcut

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

## Configuration

Configuration is stored in `~/.canvas/config/canvas-cli.json`:

```json
{
    "server": {
        "url": "http://localhost:8001/rest/v2",
        "auth": {
            "type": "token",
            "token": "canvas-server-token"
        }
    },
    "session": {
        "context": {
            "id": "default",
            "clientArray": ["client/app/canvas-cli", "..."]
        }
    },
    "connectors": {
        "anthropic": {
            "driver": "anthropic",
            "apiKey": "",
            "model": "claude-3-5-sonnet-20241022",
            "maxTokens": 4096
        },
        "openai": {
            "driver": "openai",
            "apiKey": "",
            "model": "gpt-4o",
            "maxTokens": 4096
        },
        "ollama": {
            "driver": "ollama",
            "host": "http://localhost:11434",
            "model": "qwen2.5-coder:latest"
        }
    },
    "ai": {
        "defaultConnector": "anthropic",
        "priority": ["anthropic", "openai", "ollama"],
        "contextTemplate": "canvas-assistant"
    }
}
```

## License

Licensed under AGPL-3.0-or-later. See main project LICENSE file. 

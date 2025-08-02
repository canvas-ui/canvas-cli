# Canvas CLI

A command-line interface for managing Canvas workspaces, contexts, and documents with integrated AI assistance.

## Installation

### Method 1: Download Standalone Binary (Recommended)

**No dependencies required!** Download the latest release for your platform:

| Platform | Architecture | Download |
| --- | --- | --- |
| **Linux** | x64 | [📦 canvas-linux-x64.tar.gz](https://github.com/canvas-ai/canvas-cli/releases/latest) |
| **Linux** | ARM64 | [📦 canvas-linux-arm64.tar.gz](https://github.com/canvas-ai/canvas-cli/releases/latest) |
| **macOS** | x64 | [📦 canvas-macos-x64.tar.gz](https://github.com/canvas-ai/canvas-cli/releases/latest) |
| **macOS** | ARM64 (Apple Silicon) | [📦 canvas-macos-arm64.tar.gz](https://github.com/canvas-ai/canvas-cli/releases/latest) |
| **Windows** | x64 | [📦 canvas-windows-x64.zip](https://github.com/canvas-ai/canvas-cli/releases/latest) |

**Quick install with our script:**

```bash
# One-liner installation (Linux/macOS)
curl -sSL https://raw.githubusercontent.com/canvas-ai/canvas-cli/main/scripts/install.sh | bash

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
- `ws` → Workspace management shortcut
- `q` → AI assistant shortcut

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

# AI Assistant (context-aware)
canvas q "How do I create a new context?"
canvas q "Explain this error" --code
cat error.log | canvas q "What does this error mean?"

# Show current configuration
canvas config show

# Set server URL
canvas config set server.url http://localhost:8001/rest/v2
```

## Commands

### Workspace Management

- `canvas workspace list` - List all workspaces
- `canvas workspace show <id>` - Show workspace details
- `canvas workspace create <name>` - Create new workspace
- `canvas workspace update <id>` - Update workspace
- `canvas workspace delete <id> --force` - Delete workspace

### Context Management

- `canvas context list` - List all contexts
- `canvas context list --workspace <id>` - Filter contexts by workspace
- `canvas context show <id>` - Show context details
- `canvas context create <url>` - Create new context
- `canvas context use <id>` - Set current context
- `canvas context current` - Show current context
- `canvas context tree` - Show context tree

### Authentication

- `canvas auth status` - Show authentication status
- `canvas auth login` - Login to Canvas server
- `canvas auth tokens` - List API tokens

### Configuration

- `canvas config show` - Show current configuration
- `canvas config set <key> <value>` - Set configuration value
- `canvas config get <key>` - Get configuration value

### AI Assistant

- `canvas q "<query>"` - Ask the AI assistant (context-aware)
- `canvas q status` - Show AI connector status
- `canvas q templates` - List available prompt templates
- `canvas q "<query>" --connector ollama` - Use specific AI connector
- `canvas q "<query>" --code` - Use code assistant template
- `canvas q "<query>" --show-prompt` - Display prompt before sending
- `canvas q "<query>" --show-prompt-only` - Display prompt without AI call

### Server Management (Local)

- `canvas server start` - Start Canvas server locally with PM2
- `canvas server stop` - Stop Canvas server
- `canvas server restart` - Restart Canvas server
- `canvas server status` - Show server status (local + remote)
- `canvas server logs` - Show server logs

## Shortcut Scripts

For convenience, Canvas CLI provides direct command shortcuts. ln -s all of them into your ~/.local/bin => profit $$:

```bash
# Direct context commands
context list              # Same as: canvas context list
context create my-project # Same as: canvas context create my-project
context current           # Same as: canvas context current

# Direct workspace commands
ws list                   # Same as: canvas workspace list
ws create test            # Same as: canvas workspace create test

# Direct AI queries
q "What is Canvas?"       # Same as: canvas q "What is Canvas?"
q status                  # Same as: canvas q status
echo "data" | q "analyze" # Same as: echo "data" | canvas q "analyze"
```

All options, flags, and subcommands work with the shortcuts.

## Architecture

See [canvas-ai](https://github.com/canvas-ai)

## AI Assistant

Canvas CLI includes an integrated AI assistant that is context-aware and supports multiple AI providers.

### Supported AI Connectors

- **Anthropic Claude** - Premium AI with excellent reasoning capabilities
- **OpenAI GPT** - Popular AI models including GPT-4
- **Ollama** - Local AI models for privacy and offline use

### Configuration

Set up AI connectors using environment variables:

```bash
# Anthropic (recommended)
export ANTHROPIC_API_KEY="your-anthropic-key"

# OpenAI
export OPENAI_API_KEY="your-openai-key"

# Ollama (configure host if not default)
canvas config set connectors.ollama.host http://localhost:11434
```

### Usage Examples

```bash
# Basic queries
canvas q "How do I create a new context?"
canvas q "What's the difference between workspaces and contexts?"

# Code assistance
canvas q "How do I optimize this function?" --code
echo "function test() { return null; }" | canvas q "Review this code"

# Data analysis
cat /var/log/syslog | canvas q "Are there any errors in these logs?"
ps aux | canvas q "Are there any suspicious processes?"

# Connector selection
canvas q "Explain Canvas architecture" --connector ollama
canvas q "Debug this error" --connector anthropic

# Debug and development
canvas q "Test query" --show-prompt-only
canvas q "Test query" --show-prompt
canvas q status
canvas q templates
```

### Prompt Templates

- **canvas-assistant**: General Canvas CLI assistance (default)
- **data-analysis**: Specialized for analyzing piped data
- **code-assistant**: Expert software engineering assistance

### AI Options

- `--connector <name>` - Use specific AI connector (anthropic, openai, ollama)
- `--model <name>` - Use specific model
- `--template <name>` - Use specific prompt template
- `--max-tokens <num>` - Maximum tokens for response
- `--code` - Use code assistant template
- `--raw` - Output raw JSON response
- `--quiet` - Suppress status messages
- `--show-prompt` - Display the rendered prompt before sending
- `--show-prompt-only` - Display the rendered prompt and exit (no AI call)

## Server Management

The CLI includes built-in server management for local development using PM2:

### Features

- **Start/Stop/Restart**: Full lifecycle management of Canvas server
- **Status Monitoring**: Shows both PM2 process status and API connectivity
- **Log Streaming**: Real-time log viewing with configurable line count
- **Auto-restart**: PM2 handles automatic restarts on crashes
- **Environment Variables**: Supports admin user auto-generation from env.js

### Requirements

- PM2 must be installed globally: `npm install -g pm2`
- Canvas server code must be available locally
- Server management only works for local instances
- Remote servers should be managed by their hosting platform

### Server Setup

The CLI can manage a local Canvas server, but requires the server code to be available. You have several options:

#### Option 1: Environment Variable (Recommended for development)

```bash
export CANVAS_SERVER_ROOT=/path/to/your/canvas-server
canvas server start
```

#### Option 2: Clone Server as Submodule (Standalone CLI)

```bash
# Clone Canvas server into ./server directory
git clone https://github.com/canvas-ai/canvas-server ./server
cd ./server && npm run update-submodules
npm install

# Now you can manage the server
canvas server start
```

#### Option 3: Standalone Server Installation

```bash
# Clone Canvas server separately
git clone https://github.com/canvas-ai/canvas-server
cd canvas-server && npm install

# Set environment variable
export CANVAS_SERVER_ROOT=$(pwd)
canvas server start
```

### Admin User Generation

When starting the server locally, Canvas will automatically generate admin credentials if not set:

- Check the server logs for generated admin email/password
- Use environment variables to set custom admin credentials:

    ```bash
    export CANVAS_ADMIN_EMAIL="admin@example.com"
    export CANVAS_ADMIN_PASSWORD="your-secure-password"
    canvas server start
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

## Releases and Distribution

Canvas CLI uses automated GitHub Actions to build and distribute cross-platform binaries. Every time a version tag is pushed, the system automatically:

- 🏗️ **Builds binaries** for Linux, macOS, and Windows (x64 & ARM64)
- 🧪 **Tests all binaries** to ensure they work correctly
- 📦 **Creates release packages** with proper naming and compression
- 🔐 **Generates checksums** for security verification
- 🚀 **Publishes to GitHub Releases** with professional release notes

### Creating a Release

For maintainers:

```bash
# Quick release using our script
./scripts/release.sh v1.0.0

# Manual release process
git tag v1.0.0
git push origin v1.0.0
# GitHub Actions handles the rest automatically!
```

See [RELEASE.md](RELEASE.md) for complete release documentation.

## Troubleshooting

### Connection Issues

```bash
# Check authentication status
canvas auth status

# Validate configuration
canvas config validate

# Test server connection
canvas config get server.url
```

### Debug Mode

```bash
# Enable debug logging
DEBUG=canvas:* canvas workspace list

# Or use the debug flag
canvas workspace list --debug
```

### Configuration Issues

```bash
# Show configuration file location
canvas config path

# Reset configuration
canvas config reset --force

# Edit configuration manually
canvas config edit
```

### AI Issues

```bash
# Check AI connector status
canvas q status

# Test AI connectivity
canvas q "test" --show-prompt-only

# Debug prompt rendering
canvas q "test query" --show-prompt

# Check API keys
echo $ANTHROPIC_API_KEY
echo $OPENAI_API_KEY

# Test specific connector
canvas q "test" --connector anthropic
canvas q "test" --connector ollama
```

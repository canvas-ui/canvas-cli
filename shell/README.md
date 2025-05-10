# Canvas Shell

Simple set of command-line utilities for interacting with Canvas API from your terminal.
For a more streamlined experience, use [canvas-cli](https://github.com/canvas-ai/canvas-cli) (assuming, its ready :)

## CLI Functions

- `context` - Manage Canvas contexts
- `ws` - Manage Canvas workspaces
- `canvas` - General Canvas system commands
- Extends the default shell prompt (PS1) with Canvas workspace and context info

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/canvas-shell.git
cd canvas-shell
```

2. Run the installation script:
```bash
./install.sh
```

3. Restart your terminal or source your bashrc:
```bash
source ~/.bashrc
```

## Usage

### Canvas Command

```bash
# Connect to Canvas API
canvas connect

# Check connection status
canvas status

# View configuration
canvas config

# Disconnect from Canvas API
canvas disconnect

# For the whole list, run
canvas help
```

### Workspace Command

```bash
# Show current workspace
ws

# Set workspace
ws set myworkspace

# List available workspaces
ws list

# For the whole list, run
ws help
```

### Context Command

```bash
# Set context URL
context set https://example.com

# Show current context path
context path

# List available paths
context paths

# Show context tree
context tree

# For the whole list, run
context help
```

## Configuration

Configuration is stored in `~/.canvas/config/canvas-shell.ini`.

Example configuration:
```ini
protocol="http"
host="127.0.0.1"
port="8001"
base_url="/rest/v2"
api_key="your-auth-token"

default_workspace="universe"
default_context="default"
default_session="default"
```

## TODO

- Add support for custom prompt (PS1)
- Fix the small timeout delay on start of the terminal(needs further testing, should not really be due to our CLI)

## License

MIT

#!/bin/bash

# Get absolute path to the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Check if jq is available
if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR | jq is not installed" >&2
fi

# Check if nc is available
if ! command -v nc >/dev/null 2>&1; then
    echo "ERROR | nc (netcat) is not installed" >&2
fi

# Check if curl is available
if ! command -v curl >/dev/null 2>&1; then
    echo "ERROR | curl is not installed" >&2
fi

# Check if the source line already exists in .bashrc
if ! grep -q "source \"$SCRIPT_DIR/canvas-shell.sh\"" "$HOME/.bashrc"; then
    echo "Adding Canvas Shell to .bashrc..."
    echo "" >> "$HOME/.bashrc"
    echo "# Canvas Shell Integration" >> "$HOME/.bashrc"
    echo "source \"$SCRIPT_DIR/canvas-shell.sh\"" >> "$HOME/.bashrc"
    echo "Canvas Shell installed successfully. Please restart your terminal or run 'source ~/.bashrc'"
else
    echo "Canvas Shell is already installed in .bashrc"
fi

# Create config directories if they don't exist
mkdir -vp "$HOME/.canvas/config"
mkdir -vp "$HOME/.canvas/data"
mkdir -vp "$HOME/.canvas/var"
mkdir -vp "$HOME/.canvas/var/log"

# Copy example config file if it doesn't exist
if [ ! -f "$HOME/.canvas/config/canvas-shell.ini" ]; then
    echo "Creating default configuration..."
    cp -v "$SCRIPT_DIR/config/example-canvas-shell.ini" "$HOME/.canvas/config/canvas-shell.ini"
fi

echo "Installation complete. Use 'source ~/.bashrc' to activate Canvas Shell in your current terminal."

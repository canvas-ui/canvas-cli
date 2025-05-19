#!/bin/bash

# Get the directory where this script resides
CANVAS_SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Source required libraries
source "$CANVAS_SCRIPT_DIR/lib/common.sh"

#############################
# Canvas CLI Commands       #
#############################

# Import canvas-shell applets
source "$CANVAS_SCRIPT_DIR/applets/context.sh"
source "$CANVAS_SCRIPT_DIR/applets/canvas.sh"
source "$CANVAS_SCRIPT_DIR/applets/ws.sh"

# Export functions for use in the shell
export -f context
export -f ws
export -f canvas

# Initialize canvas-shell prompt
canvas_update_prompt

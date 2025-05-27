#!/bin/bash

# Get the directory where this script resides
CANVAS_SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Source required libraries
source "$CANVAS_SCRIPT_DIR/lib/common.sh"

#############################
# Canvas CLI Commands       #
#############################

# Import canvas-shell applets
if [ "$cli_enable_context" != false ]; then
    source "$CANVAS_SCRIPT_DIR/applets/context.sh"
    export -f context
fi

if [ "$cli_enable_canvas" != false ]; then
    source "$CANVAS_SCRIPT_DIR/applets/canvas.sh"
    export -f canvas
fi

if [ "$cli_enable_ws" != false ]; then
    source "$CANVAS_SCRIPT_DIR/applets/ws.sh"
    export -f ws
fi

# Initialize canvas-shell prompt
canvas_update_prompt


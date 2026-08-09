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

# Store bash history in canvas-server contextualized (ok Dont do it,
# one JSON Document per command is a overkill, we need to support a more
# lightweight approach first)
#export HISTCONTROL=ignoredups:erasedups
#export HISTSIZE=10000
#export HISTFILESIZE=20000
#shopt -s histappend
#export PROMPT_COMMAND="history -a; canvas_update_prompt; $PROMPT_COMMAND"

# Hook canvas_update_prompt into the PROMPT_COMMAND
[[ "$PROMPT_COMMAND" != *canvas_update_prompt* ]] && \
  PROMPT_COMMAND="canvas_update_prompt; $PROMPT_COMMAND"

# Export the PROMPT_COMMAND
export PROMPT_COMMAND;

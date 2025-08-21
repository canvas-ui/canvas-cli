#!/bin/bash

# Add this script to your ~/.bashrc or ~/.zshrc to update the prompt dynamically
# based on the current CLI context

## Settings

# Session file
CANVAS_SESSION="$HOME/.canvas/config/cli-session.json"

# Colors
CANVAS_PROMPT_YELLOW="$(tput setaf 3)"
CANVAS_PROMPT_GREEN="$(tput setaf 2)"
CANVAS_PROMPT_RED="$(tput setaf 1)"
CANVAS_PROMPT_RESET="$(tput sgr0)"

# Store original prompt
ORIGINAL_PROMPT="$PS1"

#################################
# Runtime checks                #
#################################

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "ERROR | jq could not be found. Please install jq to use this script."
    exit 1
fi

# Check if the session file exists
if [ ! -f "$CANVAS_SESSION" ]; then
    echo "ERROR | Session file not found: $CANVAS_SESSION"
    exit 1
fi

#################################
# Functions                     #
#################################


canvas_connected() {
    local server_status
    server_status=$(get_value "$CANVAS_SESSION" "server_status")
    if [ "$server_status" == "connected" ]; then
        return 0
    fi
    return 1
}

canvas_update_prompt() {
    if ! canvas_connected; then
        # Server is already marked as disconnected in the session file
        export PS1="[disconnected] $ORIGINAL_PROMPT"
        # Display a message only if the shell is interactive
        if [[ $- == *i* ]]; then
            echo "INFO | Not connected to Canvas server. Run 'canvas connect' to reconnect." >&2
        fi
    else
        # Session status is "connected", so try to fetch the current context URL to verify
        local context_id
        local context_url
        context_id=$(get_value "$CANVAS_SESSION" "context_id")

        # Attempt to get context URL. Suppress stderr from canvas_http_get itself during prompt update.
        # canvas_http_get will use the updated parseStatusCode which handles disconnection state.
        context_url=$(canvas_http_get "/contexts/$context_id/url" "" "true" 2>/dev/null | jq -r '.payload.url // ""')

        # Re-check connection status, as canvas_http_get might have updated it if the call failed
        if [ -n "$context_url" ] && canvas_connected; then
            if [ "$context_id" == "default" ]; then
                export PS1="[$context_url] $ORIGINAL_PROMPT"
            else
                export PS1="[($context_id) $context_url] $ORIGINAL_PROMPT"
            fi;
        else
            # Connection lost during the attempt, or context_url is empty
            export PS1="[disconnected] $ORIGINAL_PROMPT"
            # Only mark as disconnected if not already
            if ! canvas_connected; then
                store_value "$CANVAS_SESSION" "server_status" "disconnected"
                store_value "$CANVAS_SESSION" "server_status_code" "0" # Generic code for connection lost during prompt update
            fi
        fi
    fi
}

# Hook canvas_update_prompt into the PROMPT_COMMAND
[[ "$PROMPT_COMMAND" != *canvas_update_prompt* ]] && \
  PROMPT_COMMAND="canvas_update_prompt; $PROMPT_COMMAND"

# Export the PROMPT_COMMAND
export PROMPT_COMMAND;

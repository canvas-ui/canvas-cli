#!/bin/bash

# This script will update the prompt dynamically based on the current CLI context
# and the status of the Canvas server.

# Install this script into ~/.canvas/scripts/update-prompt.sh
# and add the following line to your ~/.bashrc or ~/.zshrc:
# source ~/.canvas/scripts/update-prompt.sh or
# if [ -f ~/.canvas/scripts/update-prompt.sh ]; then
#     source ~/.canvas/scripts/update-prompt.sh
# fi

## Settings

# Session file
CANVAS_SESSION="$HOME/.canvas/config/cli-session.json"
CANVAS_REMOTES="$HOME/.canvas/config/remotes.json"

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

# Check if the remotes file exists
if [ ! -f "$CANVAS_REMOTES" ]; then
    echo "ERROR | Remotes file not found: $CANVAS_REMOTES"
    exit 1
fi

#################################
# Functions                     #
#################################

get_token() {
    local bound_remote
    bound_remote=$(cat "$CANVAS_SESSION" | jq -r '.boundRemote // empty')
    if [ -z "$bound_remote" ]; then
        return 1
    fi

    local token
    token=$(cat "$CANVAS_REMOTES" | jq -r --arg remote "$bound_remote" '.[$remote].auth.token // empty')
    if [ -z "$token" ]; then
        return 1
    fi

    echo "$token"
    return 0
}

get_api_url() {
    local bound_remote
    bound_remote=$(cat "$CANVAS_SESSION" | jq -r '.boundRemote // empty')
    if [ -z "$bound_remote" ]; then
        return 1
    fi

    local url api_base
    url=$(cat "$CANVAS_REMOTES" | jq -r --arg remote "$bound_remote" '.[$remote].url // empty')
    api_base=$(cat "$CANVAS_REMOTES" | jq -r --arg remote "$bound_remote" '.[$remote].apiBase // empty')

    if [ -z "$url" ] || [ -z "$api_base" ]; then
        return 1
    fi

    echo "${url}${api_base}"
    return 0
}

canvas_connected() {
    local server_status
    server_status=$(cat "$CANVAS_SESSION" | jq -r '.boundRemoteStatus // empty')
    [ "$server_status" = "connected" ]
}

get_context_url() {
    local token api_url context_id

    token=$(get_token) || return 1
    api_url=$(get_api_url) || return 1
    context_id=$(cat "$CANVAS_SESSION" | jq -r '.boundContextId // empty')

    if [ -z "$context_id" ]; then
        return 1
    fi

    # Make API call with timeout to keep it fast
    local response
    response=$(curl -s --max-time 1 \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        "${api_url}/contexts/${context_id}/url" 2>/dev/null)

    if [ $? -eq 0 ] && [ -n "$response" ]; then
        local status url
        status=$(echo "$response" | jq -r '.status // empty')
        if [ "$status" = "success" ]; then
            url=$(echo "$response" | jq -r '.payload.url // empty')
            if [ -n "$url" ]; then
                echo "$url"
                return 0
            fi
        fi
    fi

    return 1
}

canvas_update_prompt() {
    if ! canvas_connected; then
        export PS1="[disconnected] $ORIGINAL_PROMPT"
        return
    fi

    # Try to get current context URL from API
    local context_url
    context_url=$(get_context_url)

    if [ $? -eq 0 ] && [ -n "$context_url" ]; then
        # Successfully got context URL
        local context_id
        context_id=$(cat "$CANVAS_SESSION" | jq -r '.boundContextId // empty')

        if [ "$context_id" = "default" ]; then
            export PS1="[$context_url] $ORIGINAL_PROMPT"
        else
            export PS1="[($context_id) $context_url] $ORIGINAL_PROMPT"
        fi
    else
        # Failed to get context URL, show disconnected
        export PS1="[disconnected] $ORIGINAL_PROMPT"
    fi
}

# Hook canvas_update_prompt into the PROMPT_COMMAND
[[ "$PROMPT_COMMAND" != *canvas_update_prompt* ]] && \
  PROMPT_COMMAND="canvas_update_prompt; $PROMPT_COMMAND"

# Export the PROMPT_COMMAND
export PROMPT_COMMAND;

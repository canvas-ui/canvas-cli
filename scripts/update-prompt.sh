#!/bin/bash

# This script will update the prompt dynamically based on the current CLI context
# and the status of the Canvas server.

# Install this script into ~/.canvas/scripts/update-prompt.sh
# and add the following line to your ~/.bashrc or ~/.zshrc:
# source ~/.canvas/scripts/update-prompt.sh or
# if [ -f ~/.canvas/scripts/update-prompt.sh ]; then
#     source ~/.canvas/scripts/update-prompt.sh
# fi

# PERFORMANCE OPTIMIZATIONS:
# - Aggressive curl timeouts (0.5s max, 0.3s connect) for maximum speed
# - Session/remotes data caching to reduce file I/O operations
# - Fast-fail on connection issues to avoid blocking the prompt
# - Atomic session updates with proper cleanup on failures
# - Automatic unbinding when API calls fail to prevent repeated failures

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

# Check if jq is installed (silently fail if not available to avoid prompt disruption)
if ! command -v jq &> /dev/null; then
    # Define a no-op function to prevent errors if jq is missing
    canvas_update_prompt() { :; }
    return 2>/dev/null || exit 0
fi

# Check if curl is available (required for API calls)
if ! command -v curl &> /dev/null; then
    canvas_update_prompt() { :; }
    return 2>/dev/null || exit 0
fi

# Silently handle missing files - the functions will handle this gracefully
# This prevents the script from failing during shell initialization

#################################
# Functions                     #
#################################

# Cache session data to avoid multiple file reads
_SESSION_DATA=""
_REMOTES_DATA=""

get_session_data() {
    if [ -z "$_SESSION_DATA" ]; then
        # Check if session file exists and is readable
        if [ ! -f "$CANVAS_SESSION" ] || [ ! -r "$CANVAS_SESSION" ]; then
            return 1
        fi
        _SESSION_DATA=$(cat "$CANVAS_SESSION" 2>/dev/null) || return 1
        # Validate JSON format
        echo "$_SESSION_DATA" | jq empty 2>/dev/null || {
            _SESSION_DATA=""
            return 1
        }
    fi
    echo "$_SESSION_DATA"
}

get_remotes_data() {
    if [ -z "$_REMOTES_DATA" ]; then
        # Check if remotes file exists and is readable
        if [ ! -f "$CANVAS_REMOTES" ] || [ ! -r "$CANVAS_REMOTES" ]; then
            return 1
        fi
        _REMOTES_DATA=$(cat "$CANVAS_REMOTES" 2>/dev/null) || return 1
        # Validate JSON format
        echo "$_REMOTES_DATA" | jq empty 2>/dev/null || {
            _REMOTES_DATA=""
            return 1
        }
    fi
    echo "$_REMOTES_DATA"
}

get_token() {
    local session_data remotes_data bound_remote token
    
    session_data=$(get_session_data) || return 1
    bound_remote=$(echo "$session_data" | jq -r '.boundRemote // empty')
    if [ -z "$bound_remote" ]; then
        return 1
    fi

    remotes_data=$(get_remotes_data) || return 1
    token=$(echo "$remotes_data" | jq -r --arg remote "$bound_remote" '.[$remote].auth.token // empty')
    if [ -z "$token" ]; then
        return 1
    fi

    echo "$token"
    return 0
}

get_api_url() {
    local session_data remotes_data bound_remote url api_base
    
    session_data=$(get_session_data) || return 1
    bound_remote=$(echo "$session_data" | jq -r '.boundRemote // empty')
    if [ -z "$bound_remote" ]; then
        return 1
    fi

    remotes_data=$(get_remotes_data) || return 1
    url=$(echo "$remotes_data" | jq -r --arg remote "$bound_remote" '.[$remote].url // empty')
    api_base=$(echo "$remotes_data" | jq -r --arg remote "$bound_remote" '.[$remote].apiBase // empty')

    if [ -z "$url" ] || [ -z "$api_base" ]; then
        return 1
    fi

    echo "${url}${api_base}"
    return 0
}

canvas_connected() {
    local session_data server_status
    session_data=$(get_session_data) || return 1
    server_status=$(echo "$session_data" | jq -r '.boundRemoteStatus // empty')
    [ "$server_status" = "connected" ]
}

mark_connection_unbound() {
    # Atomically update the session file to mark connection as unbound
    local temp_file="${CANVAS_SESSION}.tmp.$$"
    
    # Create updated session with unbound status
    if jq '.boundRemoteStatus = "disconnected" | .boundContextUrl = null' "$CANVAS_SESSION" > "$temp_file" 2>/dev/null; then
        # Only update if jq succeeded
        if mv "$temp_file" "$CANVAS_SESSION" 2>/dev/null; then
            # Clear cache since we updated the file
            _SESSION_DATA=""
            return 0
        fi
    fi
    
    # Cleanup temp file if it exists
    [ -f "$temp_file" ] && rm -f "$temp_file" 2>/dev/null
    return 1
}

get_context_url() {
    local session_data token api_url context_id

    session_data=$(get_session_data) || return 1
    token=$(get_token) || return 1
    api_url=$(get_api_url) || return 1
    context_id=$(echo "$session_data" | jq -r '.boundContextId // empty')

    if [ -z "$context_id" ]; then
        return 1
    fi

    # Make API call with aggressive timeout settings for maximum speed
    local response curl_exit_code
    response=$(curl -s \
        --max-time 0.5 \
        --connect-timeout 0.3 \
        --retry 0 \
        --no-keepalive \
        --tcp-nodelay \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -H "Connection: close" \
        "${api_url}/contexts/${context_id}/url" 2>/dev/null)
    curl_exit_code=$?

    if [ $curl_exit_code -eq 0 ] && [ -n "$response" ]; then
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

    # If curl failed or response was invalid, mark as unbound
    mark_connection_unbound
    return 1
}

canvas_update_prompt() {
    # Clear cache on each prompt update to ensure fresh data
    _SESSION_DATA=""
    _REMOTES_DATA=""
    
    # Fast check: if not connected, don't try API calls
    if ! canvas_connected; then
        export PS1="[$CANVAS_PROMPT_RED●$CANVAS_PROMPT_RESET] $ORIGINAL_PROMPT"
        return
    fi

    # Try to get current context URL from API (with fast timeout and failure handling)
    local context_url context_id session_data
    
    # Get session data once and extract context_id
    session_data=$(get_session_data) || {
        export PS1="[$CANVAS_PROMPT_RED●$CANVAS_PROMPT_RESET] $ORIGINAL_PROMPT"
        return
    }
    context_id=$(echo "$session_data" | jq -r '.boundContextId // empty')
    
    # Try to get context URL - this will mark as unbound on failure
    context_url=$(get_context_url)

    if [ $? -eq 0 ] && [ -n "$context_url" ]; then
        # Successfully got context URL - show connected status
        if [ "$context_id" = "default" ] || [ -z "$context_id" ]; then
            export PS1="[$CANVAS_PROMPT_GREEN●$CANVAS_PROMPT_RESET $context_url] $ORIGINAL_PROMPT"
        else
            export PS1="[$CANVAS_PROMPT_GREEN●$CANVAS_PROMPT_RESET ($context_id) $context_url] $ORIGINAL_PROMPT"
        fi
    else
        # Failed to get context URL - connection has been marked as unbound
        export PS1="[$CANVAS_PROMPT_RED●$CANVAS_PROMPT_RESET] $ORIGINAL_PROMPT"
    fi
}

# Hook canvas_update_prompt into the PROMPT_COMMAND
[[ "$PROMPT_COMMAND" != *canvas_update_prompt* ]] && \
  PROMPT_COMMAND="canvas_update_prompt; $PROMPT_COMMAND"

# Export the PROMPT_COMMAND
export PROMPT_COMMAND;

#!/bin/bash

# Dynamically update the shell prompt to reflect Canvas connection and context.
# Simplified: no file writes, minimal caching, safe dependency/terminal checks.

# Install: source this file from ~/.bashrc or ~/.zshrc
#   [ -f "$HOME/.canvas/scripts/update-prompt.sh" ] && \
#   . "$HOME/.canvas/scripts/update-prompt.sh"

## Settings

# Paths
CANVAS_SESSION="$HOME/.canvas/config/cli-session.json"
CANVAS_REMOTES="$HOME/.canvas/config/remotes.json"

# Lightweight in-memory throttle for URL fetches (seconds)
CANVAS_PROMPT_FETCH_INTERVAL=5

# Colors (fallback to empty if tput unavailable or terminal lacks color)
CANVAS_PROMPT_YELLOW=""
CANVAS_PROMPT_GREEN=""
CANVAS_PROMPT_RED=""
CANVAS_PROMPT_RESET=""
if command -v tput >/dev/null 2>&1; then
    if [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
        CANVAS_PROMPT_YELLOW="$(tput setaf 3)"
        CANVAS_PROMPT_GREEN="$(tput setaf 2)"
        CANVAS_PROMPT_RED="$(tput setaf 1)"
        CANVAS_PROMPT_RESET="$(tput sgr0)"
    fi
fi

# Store the original prompt to append after our status
ORIGINAL_PROMPT="${PS1-}"

#################################
# Helpers
#################################

have() { command -v "$1" >/dev/null 2>&1; }

get_bound_remote() {
    [ -r "$CANVAS_SESSION" ] || return 1
    jq -r '.boundRemote // empty' "$CANVAS_SESSION"
}

get_context_id() {
    [ -r "$CANVAS_SESSION" ] || return 1
    jq -r '.boundContextId // empty' "$CANVAS_SESSION"
}

is_connected() {
    [ -r "$CANVAS_SESSION" ] || return 1
    local status
    status=$(jq -r '.boundRemoteStatus // empty' "$CANVAS_SESSION" 2>/dev/null)
    [ "$status" = "connected" ]
}

get_remote_field() {
    # $1: remote name, $2: field (e.g., url, apiBase, auth.token)
    [ -r "$CANVAS_REMOTES" ] || return 1
    local remote="$1" field="$2"
    jq -r --arg r "$remote" --arg f "$field" '.[$r] as $rm | if $rm == null then "" else ($f | split(".") as $p | reduce $p[] as $k ($rm; .[$k])) end // empty' "$CANVAS_REMOTES"
}

build_api_url() {
    local remote="$1"
    local base url path
    url=$(get_remote_field "$remote" url) || return 1
    base=$(get_remote_field "$remote" apiBase) || return 1
    [ -n "$url" ] && [ -n "$base" ] || return 1
    case "$base" in
        /*) path="$base" ;;
        *)  path="/$base" ;;
    esac
    printf "%s%s" "${url%/}" "$path"
}

fetch_context_url() {
    have jq || return 1
    have curl || return 1
    local remote context_id token api_url response url
    remote=$(get_bound_remote) || return 1
    context_id=$(get_context_id) || return 1
    [ -n "$remote" ] && [ -n "$context_id" ] || return 1
    token=$(get_remote_field "$remote" auth | jq -r '.token // empty') || return 1
    [ -n "$token" ] || return 1
    api_url=$(build_api_url "$remote") || return 1

    response=$(curl -fsS \
        --max-time 0.5 \
        --connect-timeout 0.3 \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -H "Connection: close" \
        "$api_url/contexts/$context_id/url" 2>/dev/null) || return 1

    url=$(echo "$response" | jq -r '.payload.url // empty')
    [ -n "$url" ] || return 1
    echo "$url"
}

# Simple in-memory cache (per shell process)
_CANVAS_URL_CACHE=""
_CANVAS_LAST_FETCH=0

#################################
# Prompt updater
#################################

canvas_update_prompt() {
    # If required tools are missing, leave prompt unchanged
    if ! have jq || ! have curl; then
        return 0
    fi

    if ! is_connected; then
        PS1="[$CANVAS_PROMPT_RED●$CANVAS_PROMPT_RESET] $ORIGINAL_PROMPT"
        return 0
    fi

    local now url context_id
    now=$(date +%s)
    context_id=$(get_context_id)

    if [ -n "$_CANVAS_URL_CACHE" ] && [ $((now - _CANVAS_LAST_FETCH)) -lt $CANVAS_PROMPT_FETCH_INTERVAL ]; then
        url="$_CANVAS_URL_CACHE"
    else
        url=$(fetch_context_url) || url=""
        if [ -n "$url" ]; then
            _CANVAS_URL_CACHE="$url"
            _CANVAS_LAST_FETCH=$now
        fi
    fi

    if [ -n "$url" ]; then
        if [ -z "$context_id" ] || [ "$context_id" = "default" ]; then
            PS1="[$CANVAS_PROMPT_GREEN●$CANVAS_PROMPT_RESET $url] $ORIGINAL_PROMPT"
        else
            PS1="[$CANVAS_PROMPT_GREEN●$CANVAS_PROMPT_RESET ($context_id) $url] $ORIGINAL_PROMPT"
        fi
    else
        PS1="[$CANVAS_PROMPT_RED●$CANVAS_PROMPT_RESET] $ORIGINAL_PROMPT"
    fi
}

#################################
# Hook into shell prompt
#################################

if [ -n "$ZSH_VERSION" ]; then
    # zsh: add to precmd hook if not already present
    if typeset -f precmd >/dev/null 2>&1; then :; fi
    typeset -ga precmd_functions 2>/dev/null
    case " ${precmd_functions[*]} " in
        *" canvas_update_prompt "*) ;;
        *) precmd_functions+=(canvas_update_prompt) ;;
    esac
else
    # bash: prepend to PROMPT_COMMAND once
    case "$PROMPT_COMMAND" in
        *canvas_update_prompt*) ;;
        "") PROMPT_COMMAND="canvas_update_prompt" ;;
        *)   PROMPT_COMMAND="canvas_update_prompt; $PROMPT_COMMAND" ;;
    esac
    export PROMPT_COMMAND
fi

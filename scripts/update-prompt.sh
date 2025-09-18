#!/bin/bash

# Dynamically update the shell prompt to reflect Canvas connection and context.
# Simplified: no file writes, minimal caching, safe dependency/terminal checks.

# Install: source this file from ~/.bashrc or ~/.zshrc
#   [ -f "$HOME/.canvas/scripts/update-prompt.sh" ] && \
#   . "$HOME/.canvas/scripts/update-prompt.sh"

## Settings

# Paths
CANVAS_SESSION="$HOME/.canvas/config/cli-session.json"

# How often to refresh the context URL via network if the session file is older than this
CANVAS_CONTEXT_UPDATE_TIMEOUT=30

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

get_context_id() {
    [ -r "$CANVAS_SESSION" ] || return 1
    jq -r '.boundContextId // empty' "$CANVAS_SESSION"
}

get_context_url() {
	[ -r "$CANVAS_SESSION" ] || return 1
	jq -r '.boundContextUrl // empty' "$CANVAS_SESSION"
}

is_connected() {
    [ -r "$CANVAS_SESSION" ] || return 1
    local status
    status=$(jq -r '.boundRemoteStatus // empty' "$CANVAS_SESSION" 2>/dev/null)
    [ "$status" = "connected" ]
}

get_bound_remote() {
    [ -r "$CANVAS_SESSION" ] || return 1
    jq -r '.boundRemote // empty' "$CANVAS_SESSION"
}

get_remote_value() {
    # $1: remote, $2: jq path under the remote
    [ -r "$CANVAS_REMOTES" ] || return 1
    local remote="$1" path="$2"
    jq -r --arg r "$remote" --arg p "$path" '.[$r] as $rm | if $rm == null then "" else ($p | split(".") as $keys | reduce $keys[] as $k ($rm; .[$k])) end // empty' "$CANVAS_REMOTES"
}

build_api_url() {
    local remote="$1" url base path
    url=$(get_remote_value "$remote" url) || return 1
    base=$(get_remote_value "$remote" apiBase) || return 1
    [ -n "$url" ] && [ -n "$base" ] || return 1
    case "$base" in
        /*) path="$base" ;;
        *)  path="/$base" ;;
    esac
    printf "%s%s" "${url%/}" "$path"
}

session_mtime() {
    [ -r "$CANVAS_SESSION" ] || return 1
    # GNU stat then BSD stat
    stat -c %Y "$CANVAS_SESSION" 2>/dev/null || stat -f %m "$CANVAS_SESSION" 2>/dev/null
}

should_refresh_context_url() {
    local mtime now diff
    mtime=$(session_mtime) || return 0
    now=$(date +%s)
    diff=$((now - mtime))
    [ "$diff" -ge "$CANVAS_CONTEXT_UPDATE_TIMEOUT" ]
}

fetch_context_url() {
    have jq || return 1
    have curl || return 1
    local remote context_id token api_url response url
    remote=$(get_bound_remote) || return 1
    context_id=$(get_context_id) || return 1
    [ -n "$remote" ] && [ -n "$context_id" ] || return 1
    token=$(get_remote_value "$remote" auth.token) || return 1
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

update_session_context_url() {
    # Atomically write boundContextUrl back into the session file
    local new_url="$1" tmp
    [ -n "$new_url" ] || return 1
    [ -r "$CANVAS_SESSION" ] || return 1
    tmp="${CANVAS_SESSION}.tmp.$$"
    if jq --arg url "$new_url" '.boundContextUrl = $url' "$CANVAS_SESSION" > "$tmp" 2>/dev/null; then
        mv "$tmp" "$CANVAS_SESSION" 2>/dev/null || rm -f "$tmp" 2>/dev/null
    else
        rm -f "$tmp" 2>/dev/null
        return 1
    fi
}

# Note: No network calls; we prefer the boundContextUrl in the session file.

#################################
# Prompt updater
#################################

canvas_update_prompt() {
    # If jq is missing, leave prompt unchanged
    if ! have jq; then
        return 0
    fi

    if ! is_connected; then
        PS1="[$CANVAS_PROMPT_RED●$CANVAS_PROMPT_RESET] $ORIGINAL_PROMPT"
        return 0
    fi

    local url context_id
    context_id=$(get_context_id)
    url=$(get_context_url)

    # Refresh URL from server only if session file is older than timeout or URL is empty
    if should_refresh_context_url || [ -z "$url" ]; then
        new_url=$(fetch_context_url 2>/dev/null)
        if [ -n "$new_url" ]; then
            url="$new_url"
            update_session_context_url "$new_url" 2>/dev/null || true
        fi
    fi

    if [ -n "$url" ]; then
        if [ -z "$context_id" ] || [ "$context_id" = "default" ]; then
            PS1="[$CANVAS_PROMPT_GREEN●$CANVAS_PROMPT_RESET $url] $ORIGINAL_PROMPT"
        else
            PS1="[$CANVAS_PROMPT_GREEN●$CANVAS_PROMPT_RESET ($context_id) $url] $ORIGINAL_PROMPT"
        fi
    else
        # Connected but missing URL: show status without URL
        if [ -z "$context_id" ] || [ "$context_id" = "default" ]; then
            PS1="[$CANVAS_PROMPT_GREEN●$CANVAS_PROMPT_RESET] $ORIGINAL_PROMPT"
        else
            PS1="[$CANVAS_PROMPT_GREEN●$CANVAS_PROMPT_RESET ($context_id)] $ORIGINAL_PROMPT"
        fi
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

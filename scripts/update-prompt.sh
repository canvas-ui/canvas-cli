#!/bin/bash

# Dynamically update the shell prompt to reflect Canvas connection and context.
# Simplified: no file writes, minimal caching, safe dependency/terminal checks.

# Install: source this file from ~/.bashrc or ~/.zshrc
#   [ -f "$HOME/.canvas/scripts/update-prompt.sh" ] && \
#   . "$HOME/.canvas/scripts/update-prompt.sh"

## Settings

# Paths
_canvas_home="${CANVAS_USER_HOME:-$HOME/.canvas}"
CANVAS_SESSION="$_canvas_home/config/cli-session.json"
CANVAS_REMOTES="$_canvas_home/config/remotes.json"

# How often to refresh the context URL via network if the session file is older than this
CANVAS_CONTEXT_UPDATE_TIMEOUT=30

# Colors (fallback to empty if tput unavailable or terminal lacks color).
# Escape sequences must be marked non-printing or the shell miscounts the
# prompt width and mangles line editing: \[ \] in bash, %{ %} in zsh.
CANVAS_PROMPT_YELLOW=""
CANVAS_PROMPT_GREEN=""
CANVAS_PROMPT_RED=""
CANVAS_PROMPT_RESET=""
if [ -n "${ZSH_VERSION-}" ]; then
    _canvas_np_open="%{"; _canvas_np_close="%}"
else
    _canvas_np_open="\["; _canvas_np_close="\]"
fi
if command -v tput >/dev/null 2>&1; then
    if [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
        CANVAS_PROMPT_YELLOW="${_canvas_np_open}$(tput setaf 3)${_canvas_np_close}"
        CANVAS_PROMPT_GREEN="${_canvas_np_open}$(tput setaf 2)${_canvas_np_close}"
        CANVAS_PROMPT_RED="${_canvas_np_open}$(tput setaf 1)${_canvas_np_close}"
        CANVAS_PROMPT_RESET="${_canvas_np_open}$(tput sgr0)${_canvas_np_close}"
    fi
fi
unset _canvas_np_open _canvas_np_close

# Store the original prompt to append after our status
ORIGINAL_PROMPT="${PS1-}"

#################################
# Helpers
#################################

_canvas_have() { command -v "$1" >/dev/null 2>&1; }

_canvas_get_context_id() {
    [ -r "$CANVAS_SESSION" ] || return 1
    jq -r '.boundContextId // empty' "$CANVAS_SESSION"
}

_canvas_get_context_url() {
	[ -r "$CANVAS_SESSION" ] || return 1
	jq -r '.boundContextUrl // empty' "$CANVAS_SESSION"
}

_canvas_is_connected() {
    [ -r "$CANVAS_SESSION" ] || return 1
    local status
    status=$(jq -r '.boundRemoteStatus // empty' "$CANVAS_SESSION" 2>/dev/null)
    [ "$status" = "connected" ]
}

_canvas_get_bound_remote() {
    [ -r "$CANVAS_SESSION" ] || return 1
    jq -r '.boundRemote // empty' "$CANVAS_SESSION"
}

_canvas_get_remote_value() {
    # $1: remote, $2: jq path under the remote
    [ -r "$CANVAS_REMOTES" ] || return 1
    local remote="$1" path="$2"
    jq -r --arg r "$remote" --arg p "$path" '.[$r] as $rm | if $rm == null then "" else ($p | split(".") as $keys | reduce $keys[] as $k ($rm; .[$k])) end // empty' "$CANVAS_REMOTES"
}

_canvas_build_api_url() {
    local remote="$1" url base path
    url=$(_canvas_get_remote_value "$remote" url) || return 1
    base=$(_canvas_get_remote_value "$remote" apiBase) || return 1
    [ -n "$url" ] && [ -n "$base" ] || return 1
    case "$base" in
        /*) path="$base" ;;
        *)  path="/$base" ;;
    esac
    printf "%s%s" "${url%/}" "$path"
}

_canvas_session_mtime() {
    [ -r "$CANVAS_SESSION" ] || return 1
    # GNU stat then BSD stat
    stat -c %Y "$CANVAS_SESSION" 2>/dev/null || stat -f %m "$CANVAS_SESSION" 2>/dev/null
}

_canvas_should_refresh_context_url() {
    local mtime now diff
    mtime=$(_canvas_session_mtime) || return 0
    now=$(date +%s)
    diff=$((now - mtime))
    [ "$diff" -ge "$CANVAS_CONTEXT_UPDATE_TIMEOUT" ]
}

_canvas_fetch_context_url() {
    _canvas_have jq || return 1
    _canvas_have curl || return 1
    local remote context_id token api_url response url
    remote=$(_canvas_get_bound_remote) || return 1
    context_id=$(_canvas_get_context_id) || return 1
    [ -n "$remote" ] && [ -n "$context_id" ] || return 1
    token=$(_canvas_get_remote_value "$remote" auth.token) || return 1
    [ -n "$token" ] || return 1
    api_url=$(_canvas_build_api_url "$remote") || return 1

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

_canvas_update_session_context_url() {
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

# Note: We prefer the boundContextUrl, but will refresh via network when stale.

#################################
# Prompt updater
#################################

canvas_update_prompt() {
    # If jq is missing, leave prompt unchanged
    if ! _canvas_have jq; then
        return 0
    fi

    if ! _canvas_is_connected; then
        PS1="[$CANVAS_PROMPT_RED●$CANVAS_PROMPT_RESET] $ORIGINAL_PROMPT"
        return 0
    fi

    local url context_id new_url
    context_id=$(_canvas_get_context_id)
    url=$(_canvas_get_context_url)

    # Refresh URL from server only if session file is older than timeout or URL is empty
    if _canvas_should_refresh_context_url || [ -z "$url" ]; then
        new_url=$(_canvas_fetch_context_url 2>/dev/null)
        if [ -n "$new_url" ]; then
            url="$new_url"
            _canvas_update_session_context_url "$new_url" 2>/dev/null || true
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

if [ -n "${ZSH_VERSION-}" ]; then
    # zsh: add to precmd hook if not already present
    if typeset -f precmd >/dev/null 2>&1; then :; fi
    typeset -ga precmd_functions 2>/dev/null
    case " ${precmd_functions[*]} " in
        *" canvas_update_prompt "*) ;;
        *) precmd_functions+=(canvas_update_prompt) ;;
    esac
else
    # bash: prepend to PROMPT_COMMAND once
    case "${PROMPT_COMMAND-}" in
        *canvas_update_prompt*) ;;
        "") PROMPT_COMMAND="canvas_update_prompt" ;;
        *)   PROMPT_COMMAND="canvas_update_prompt; $PROMPT_COMMAND" ;;
    esac
    export PROMPT_COMMAND
fi

#!/bin/bash

# Dynamically update the shell prompt to reflect Canvas connection and context.
# Simplified: no file writes, minimal caching, safe dependency/terminal checks.

# Install: source this file from ~/.bashrc or ~/.zshrc
#   [ -f "$HOME/.canvas/scripts/update-prompt.sh" ] && \
#   . "$HOME/.canvas/scripts/update-prompt.sh"

## Settings

# Paths
CANVAS_SESSION="$HOME/.canvas/config/cli-session.json"

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

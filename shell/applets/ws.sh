#!/bin/bash


# Get the directory of the current script
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")

# Source common.sh from the same directory
source "${SCRIPT_DIR}/../lib/common.sh"


##
# Canvas Workspaces CLI
##


# Help / usage message
function ws_usage() {
    echo "Usage: ws <command> [arguments]"
    echo "Commands:"
    echo "  help     Show this help message"
}


# Main workspace management function
function ws() {
    # Check for arguments
    if [ $# -eq 0 ]; then
        ws_usage
        return 1
    fi

    # Parse command and arguments
    local cmd="$1"
    shift

    # Main switch
    case "$cmd" in
        set)
            if [ $# -ne 1 ]; then
                echo "Usage: ws set <workspace_id>"
                return 1
            fi
            store_value "$CANVAS_SESSION" "workspace_id" "$1"
            echo "Workspace set to '$1'"
            canvas_update_prompt
            ;;
        list)
            # Check if connected
            if ! canvas_check_connection; then canvas_update_prompt; return 1; fi;
            canvas_http_get "/workspaces" | jq '.payload'
            ;;
        help)
            ws_usage
            ;;
        *)
            echo "Unknown ws command: $cmd"
            ws_usage
            return 1
            ;;
    esac
}

#!/bin/bash


# Get the directory of the current script
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")

# Source common.sh from the same directory
source "${SCRIPT_DIR}/../lib/common.sh"


##
# Canvas Server management CLI
##

# Help / usage message
function canvas_usage() {
    echo "Usage: canvas <command> [arguments]"
    echo "Commands:"
    echo "  start    Start the Canvas server"
    echo "  stop     Stop the Canvas server"
    echo "  status   Show the status of the Canvas server"
    echo "  restart  Restart the Canvas server"
    echo "  connect  Connect to the Canvas server"
    echo "  disconnect  Disconnect from the Canvas server"
    echo "  help     Show this help message"
}

# Main canvas function
function canvas() {
    # Check for arguments
    if [ $# -eq 0 ]; then
        canvas_usage
        return 1
    fi

    # Parse command and arguments
    local cmd="$1"
    shift

    # Main switch
    case "$cmd" in
        start)
            echo "Not implemented"
            exit 1
            ;;
        stop)
            echo "Not implemented"
            exit 1
            ;;
        restart)
            echo "Not implemented"
            exit 1
            ;;
        connect)
            canvas_connect
            if [ $? -eq 1 ]; then
                echo "Error: failed to connect to Canvas API"
            else
                echo "Connected to Canvas API"
            fi
            canvas_update_prompt
            ;;
        disconnect)
            canvas_disconnect
            if [ $? -eq 1 ]; then
                echo "Error: failed to disconnect from Canvas API"
                return 1
            fi
            echo "Disconnected from Canvas API"
            canvas_update_prompt
            ;;
        ping)
            canvas_ping
            if [ $? -eq 1 ]; then
                echo "Error: failed to ping Canvas API"
                return 1
            fi
            ;;
        status)
            if canvas_connected; then
                echo "Connected to Canvas API at $CANVAS_URL"
                echo "Workspace: $(get_value "$CANVAS_SESSION" "workspace_id")"
                echo "Session: $(get_value "$CANVAS_SESSION" "session_id")"
                echo "Context: $(get_value "$CANVAS_SESSION" "context_id")"
            else
                echo "Canvas API not reachable at $CANVAS_URL"
            fi
            ;;
        config)
            echo "Configuration:"
            echo "  API URL: $CANVAS_URL"
            echo "  Protocol: $CANVAS_PROTO"
            echo "  Host: $CANVAS_HOST"
            echo "  Port: $CANVAS_PORT"
            echo "  Base URL: $CANVAS_URL_BASE"
            echo "  Config file: $CANVAS_CONFIG"
            echo "  Session file: $CANVAS_SESSION"
            ;;
        help)
            canvas_usage
            ;;
        *)
            echo "Unknown canvas command: $cmd"
            canvas_usage
            return 1
            ;;
    esac
}


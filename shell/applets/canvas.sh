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
    echo "  login    Set Canvas API key and/or server URL"
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
                echo "ERROR | Failed to connect to Canvas API"
                return 1
            fi
            echo "INFO | Connected to Canvas API"
            canvas_update_prompt
            ;;
        disconnect)
            canvas_disconnect
            if [ $? -eq 1 ]; then
                echo "ERROR | Failed to disconnect from Canvas API"
                return 1
            fi
            echo "INFO | Disconnected from Canvas API"
            canvas_update_prompt
            ;;
        ping)
            local raw="false"
            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --raw)
                        raw="true"
                        shift
                        ;;
                    *)
                        echo "Unknown option: $1"
                        return 1
                        ;;
                esac
            done
            canvas_http_get "/ping" "" "$raw"
            if [ $? -eq 1 ]; then
                echo "ERROR | Failed to ping Canvas API"
                return 1
            fi
            echo "INFO | Ponged Canvas API"
            ;;
        status)
            if canvas_connected; then
                echo "INFO | Connected to Canvas API at $CANVAS_URL"
                echo "INFO | Workspace ID: $(get_value "$CANVAS_SESSION" "workspace_id")"
                echo "INFO | Context ID: $(get_value "$CANVAS_SESSION" "context_id")"
            else
                echo "ERROR | Canvas API not reachable at $CANVAS_URL"
                return 1
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
            echo "  API Key: $CANVAS_API_KEY"
            ;;
        login)
            if [ $# -gt 1 ]; then
                echo "Usage: canvas login [<url>]"
                return 1
            fi
            if ! canvas_login "$1"; then
                echo "ERROR | Failed to login to Canvas API"
                return 1
            fi
            canvas_connect
            canvas_update_prompt
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

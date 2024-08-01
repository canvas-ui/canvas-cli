#!/bin/bash


# Get the directory of the current script
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")

# Source common.sh from the same directory
source "${SCRIPT_DIR}/lib/common.sh"


##
# Canvas Context CLI
##


#########################################
# Canvas REST API bash wrapper          #
#########################################

# Help / usage message
function usage() {
    echo "Usage: context <command> [arguments]"
    echo "Commands:"
    echo "  connect          Connect to the Canvas API"
    echo "  disconnect       Disconnect from the Canvas API"
    echo "  set <url>        Set the context URL"
    echo "  tree             Get the context tree"
    echo "  path             Get the current context path"
    echo "  paths            Get all available context paths"
    echo "  url              Get the current context URL"
    echo "  bitmaps          Get the context bitmaps"
    echo "  list             List all documents for the given context"
    echo "  list <abstr>     List all documents for the given context of a given abstraction"
    echo "  get <docid>      (TODO) Get document with the given ID"
    echo "  sessions <list|set|create>  Session support for the terminal"
    echo ""
}

# Main context function
function context() {

    local res;

    # Check for arguments
    if [[ $# -eq 0 ]]; then
        echo "Error: missing argument"
        usage
        return 1
    fi

    # Parse command and arguments
    local command="$1"
    shift

    case "$command" in
    connect)
        canvas_connect
        ;;

    disconnect)
        canvas_disconnect
        ;;

    set)
        # Check if connected
        if ! canvas_check_connection; then canvas_update_prompt; return 1; fi;

        # Parse URL argument
        if [[ $# -ne 1 ]]; then
            echo "Error: invalid arguments for 'set' command"
            echo "Usage: context set <url>"
            return 1
        fi

        local url="$1"
        res=$(canvas_http_post "/context/url" "{\"url\": \"$url\", \"sessionId\": \"$CANVAS_SESSION_ID\",\"contextId\": \"$CANVAS_CONTEXT_ID\"}")

        # Update prompt on disconnect
        if [ $? -eq 1 ]; then
            echo "Error: failed to set context URL";
            canvas_update_prompt;
            return 1;
        fi;

        if echo "$res" | jq .status | grep -q "error"; then
            echo "Error: failed to set context URL"
            echo "Response: $res"
            return 1
        fi

        echo "$res" | jq -r '.status + " | " + .message + ": " + .payload'
        ;;

    tree)
        # Check if connected
        if ! canvas_check_connection; then canvas_update_prompt; return 1; fi;
        canvas_http_get "/context/tree" | jq .payload | jq .
        ;;

    path)
        # Check if connected
        if ! canvas_check_connection; then canvas_update_prompt; return 1; fi;
        canvas_http_get "/context/path" "{\"sessionId\": \"$CANVAS_SESSION_ID\",\"contextId\": \"$CANVAS_CONTEXT_ID\"}" | jq '.payload' | sed 's/"//g';
        ;;

    paths)
        # Check if connected
        if ! canvas_check_connection; then canvas_update_prompt; return 1; fi;
        canvas_http_get "/context/paths" | jq '.payload'
        ;;

    url)
        # Check if connected
        if ! canvas_check_connection; then canvas_update_prompt; return 1; fi;
        canvas_http_get "/context/url" "{\"sessionId\": \"$CANVAS_SESSION_ID\",\"contextId\": \"$CANVAS_CONTEXT_ID\"}" | jq '.payload'
        ;;

    bitmaps)
        # Check if connected
        if ! canvas_check_connection; then canvas_update_prompt; return 1; fi;
        canvas_http_get "/context/bitmaps" "{\"sessionId\": \"$CANVAS_SESSION_ID\",\"contextId\": \"$CANVAS_CONTEXT_ID\"}" | jq '.payload'
        ;;
    insert)
        # Check if connected
        if ! canvas_check_connection; then canvas_update_prompt; return 1; fi;

        # Parse path argument
        if [[ $# -ne 1 ]]; then
            echo "Error: invalid arguments for 'add' command"
            echo "Usage: context add <path>"
            return 1
        fi

        # TODO: send API request to add file or folder to context
        ;;

    list)
        # Check if connected
        if ! canvas_check_connection; then canvas_update_prompt; return 1; fi;

        # Parse optional document type argument
        if [[ $# -eq 0 ]]; then
            canvas_http_get "/context/documents" "{\"sessionId\": \"$CANVAS_SESSION_ID\",\"contextId\": \"$CANVAS_CONTEXT_ID\"}" | jq .
        else
            case "$1" in
            notes)
                canvas_http_get "/context/documents/notes" "{\"sessionId\": \"$CANVAS_SESSION_ID\",\"contextId\": \"$CANVAS_CONTEXT_ID\"}" | jq .
                ;;
            tabs)
                canvas_http_get "/context/documents/tabs" "{\"sessionId\": \"$CANVAS_SESSION_ID\",\"contextId\": \"$CANVAS_CONTEXT_ID\"}" | jq .
                ;;
            todo)
                canvas_http_get "/context/documents/todo" "{\"sessionId\": \"$CANVAS_SESSION_ID\",\"contextId\": \"$CANVAS_CONTEXT_ID\"}" | jq .
                ;;
            files)
                canvas_http_get "/context/documents/files" "{\"sessionId\": \"$CANVAS_SESSION_ID\",\"contextId\": \"$CANVAS_CONTEXT_ID\"}" | jq .
                ;;

            *)
                echo "Error: untested document type '$1'"
                echo "Usage: context list [notes|tabs|todo|files]"
                # Temporary
                canvas_http_get "/context/documents/$1" "{\"sessionId\": \"$CANVAS_SESSION_ID\",\"contextId\": \"$CANVAS_CONTEXT_ID\"}" | jq .
                ;;
            esac
        fi
        ;;

    sessions)
        if ! canvas_check_connection; then canvas_update_prompt; return 1; fi;
        if [[ $# -eq 0 ]]; then
            echo "Error: invalid arguments for 'session' command"
            echo "Usage:"
            echo "  context sessions list"
            echo "  context sessions set <sessionId>"
            echo "  context sessions create <sessionId>"
            echo "  context sessions create <sessionId> <baseUrl>"
            return 1
        fi

        local subcommand="$1"
        shift

        case "$subcommand" in
        list)
            canvas_http_get "/sessions" | jq '.payload'
            ;;

        set)
            if [[ $# -ne 1 ]]; then
                echo "Error: invalid arguments for 'session set' command"
                echo "Usage: context session set <sessionId>"
                return 1
            fi

            local sessionId="$1"
            # Replace the CANVAS_SESSION_ID with the new sessionId in CANVAS_SESSION
            CANVAS_SESION_ID="$sessionId"
            sed -i "s/CANVAS_SESSION_ID=.*/CANVAS_SESSION_ID=\"$sessionId\"/" "$CANVAS_SESSION"
            CANVAS_SESSION_ID="$sessionId"
            echo "Session ID set to '$sessionId'"
            canvas_update_prompt
            ;;

        create)
            if [[ $# -eq 0 ]]; then
                echo "Error: invalid arguments for 'sessions create' command"
                echo "Usage: context sessions create <sessionId>"
                return 1
            fi

            local sessionId="$1"
            local baseUrl="$2"

            res=$(canvas_http_post "/sessions/create" "{\"sessionId\": \"$sessionId\", \"sessionOptions\":{\"baseUrl\": \"$baseUrl\"}}")
            if echo "$res" | jq .status | grep -q "error"; then
                echo "Error: failed to create session"
                echo "Response: $res"
                return 1
            fi

            echo "$res" | jq '.payload'
            ;;
        esac
        ;;


    *)
        echo "Error: unknown command '$command'"
        usage
        return 1
        ;;
    esac
}

# Update users prompt for some canvas bling-bling
canvas_update_prompt

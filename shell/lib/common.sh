#!/bin/bash


#############################
# Runtime config            #
#############################

# Get the directory of the current script
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")

# Load the kvstore library
source "$SCRIPT_DIR/kvstore.sh"

# Set Canvas home directory
# TODO: Add support for portable mode
# TODO: Add support for env var override
# TODO: Add support for canvas .env file
CANVAS_USER_HOME="$HOME/.canvas"
CANVAS_USER_CONFIG="$CANVAS_USER_HOME/config"
CANVAS_USER_DATA="$CANVAS_USER_HOME/data"
CANVAS_USER_VAR="$CANVAS_USER_HOME/var"
CANVAS_USER_LOG="$CANVAS_USER_VAR/log"

# Poor-mans session support
CANVAS_CONFIG="$CANVAS_USER_CONFIG/canvas-shell.ini"
CANVAS_SESSION="$CANVAS_USER_VAR/canvas-shell.session"

# Ensure canvas directories exist
mkdir -p "$CANVAS_USER_HOME"
mkdir -p "$CANVAS_USER_CONFIG"
mkdir -p "$CANVAS_USER_DATA"
mkdir -p "$CANVAS_USER_VAR"
mkdir -p "$CANVAS_USER_LOG"

#############################
# Runtime dependencies      #
#############################

# Backup the current prompt
ORIGINAL_PROMPT="$PS1"

# Check if jq is available
if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR | jq is not installed" >&2
fi

# Check if nc is available
if ! command -v nc >/dev/null 2>&1; then
    echo "ERROR | nc (netcat) is not installed" >&2
fi

# Check if curl is available
if ! command -v curl >/dev/null 2>&1; then
    echo "ERROR | curl is not installed" >&2
fi


#####################################
# Setup Canvas SHELL configuration  #
#####################################

# Ensure the REST API transport config file exists
if [ ! -f "$CANVAS_CONFIG" ]; then
    echo "INFO | Canvas REST API transport configuration file not found at $CANVAS_CONFIG, creating with default values.."
    cp -vf "$SCRIPT_DIR/../config/example-canvas-shell.ini" "$CANVAS_CONFIG"
fi

# Load the config file
load_values "$CANVAS_CONFIG"
if [ $? -ne 0 ]; then
    echo "ERROR | Failed to load Canvas SHELL configuration file \"$CANVAS_CONFIG\"" >&2
    exit 1
fi

# Update variables with config file values
# We do not need to re-assign them this way > TODO: Remove this
CANVAS_PROTO="$protocol"
CANVAS_HOST="$host"
CANVAS_PORT="$port"
CANVAS_URL_BASE="$base_url"
CANVAS_API_KEY="$api_key"

# Check if all required variables are set
if [ -z "$CANVAS_PROTO" ] || [ -z "$CANVAS_HOST" ] || [ -z "$CANVAS_PORT" ] || [ -z "$CANVAS_URL_BASE" ] || [ -z "$CANVAS_API_KEY" ]; then
    echo "ERROR | Missing required variables" >&2
    exit 1
fi

# Construct the canvas server endpoint URL
CANVAS_URL="$CANVAS_PROTO://$CANVAS_HOST:$CANVAS_PORT$CANVAS_URL_BASE"

#####################################
# Setup Canvas SHELL Session        #
#####################################

if [ -f "$CANVAS_SESSION" ]; then
    load_values "$CANVAS_SESSION"
    if [ $? -ne 0 ]; then
        echo "ERROR | Failed to load Canvas SHELL session file \"$CANVAS_SESSION\"" >&2
        exit 1
    fi
fi

# Session defaults
if [ -z "$session_id" ]; then
    session_id="default"
    store_value "$CANVAS_SESSION" "session_id" "$session_id"
fi

if [ -z "$context_id" ]; then
    context_id="default"
    store_value "$CANVAS_SESSION" "context_id" "$context_id"
fi

if [ -z "$workspace_id" ]; then
    workspace_id="universe"
    store_value "$CANVAS_SESSION" "workspace_id" "$workspace_id"
fi

if [ -z "$server_status" ]; then
    server_status="disconnected"
    store_value "$CANVAS_SESSION" "server_status" "$server_status"
fi

if [ -z "$server_status_code" ]; then
    server_status_code="0"
    store_value "$CANVAS_SESSION" "server_status_code" "$server_status_code"
fi


#############################
# Utility functions         #
#############################

canvas_connected() {
    [ "$(get_value "$CANVAS_SESSION" "server_status")" == "connected" ]
}

parsePayload() {
    local payload="$1"
    local raw="$2"

    if (echo "$payload" | jq -e . >/dev/null 2>&1); then
        if [ "$raw" = "true" ]; then
            echo "$payload"
        else
            # Extract payload field if it exists
            if echo "$payload" | jq -e '.payload' >/dev/null 2>&1; then
                echo "$payload" | jq '.payload'
            else
                echo "$payload"
            fi
        fi
    else
        echo "ERROR | Failed to parse API response payload" >&2
        echo "Raw response: $payload"
        return 1
    fi
}

parseStatusCode() {
    local request_type="$1"
    local status_code="$2"
    local response="$3"

    if [[ "$status_code" -eq 200 ]]; then
        # Check if the response indicates success
        if echo "$response" | jq -e '.status == "success"' >/dev/null 2>&1; then
            return 0
        else
            echo "ERROR | API request failed: $(echo "$response" | jq -r '.message // "Unknown error"')" >&2
            store_value "$CANVAS_SESSION" "server_status" "disconnected"
            store_value "$CANVAS_SESSION" "server_status_code" "$status_code"
            canvas_update_prompt
            return 1
        fi
    else
        # If status code starts with 5, mark the connection as down
        if [[ "$status_code" =~ ^5 ]]; then
            store_value "$CANVAS_SESSION" "server_status" "disconnected"
            store_value "$CANVAS_SESSION" "server_status_code" "$status_code"
            canvas_update_prompt
        fi

        echo "ERROR | HTTP $request_type request failed with status code $status_code" >&2
        echo "Request URL: $CANVAS_URL/$url" >&2
        echo "Raw result: $response" >&2
        return $status_code
    fi
}

canvas_api_reachable() {
    # Use curl to fetch HTTP headers with proper timeouts
    local status=$(curl -skI --connect-timeout 3 --max-time 5 -o /dev/null -w '%{http_code}' "$CANVAS_URL/ping" 2>/dev/null)
    local curl_exit=$?

    if [[ $curl_exit -ne 0 ]]; then
        echo "ERROR | Canvas API endpoint \"$CANVAS_URL\" not reachable (curl error: $curl_exit)"
        return 1
    elif [[ "$status" -eq 200 ]]; then
        return 0
    else
        echo "ERROR | Canvas API endpoint \"$CANVAS_URL\" returned status code: $status"
        return 1
    fi
}

#############################
# curl wrappers             #
#############################

canvas_http_get() {
    local url="${1#/}"
    local data="$2"
    local raw="$3"
    local response
    local http_code
    local response_body

    # Execute curl command, capture the output (response body) and the status code
    response=$(curl -sk -X GET \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CANVAS_API_KEY" \
        -w "\n%{http_code}" \
        -d "$data" \
        -o - \
        "$CANVAS_URL/$url")

    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)

    if [ $? -ne 0 ]; then
        echo "ERROR | Failed to send HTTP GET request" >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        canvas_update_prompt
        return 1
    fi

    # Check for non-200 HTTP status code
    if ! parseStatusCode "GET" "$http_code" "$response_body"; then
        return 1
    fi

    # Parse the payload if needed
    parsePayload "$response_body" "$raw"
}

canvas_http_post() {
    local url="${1#/}"
    local data="$2"
    local raw="$3"
    local result
    local http_code
    local payload

    result=$(curl -sk \
        -X POST \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CANVAS_API_KEY" \
        -d "$data" \
        "$CANVAS_URL/$url")

    if [ $? -ne 0 ]; then
        echo "ERROR | failed to send HTTP POST request" >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        canvas_update_prompt
        return 1
    fi

    # Extract the http_code from the end of the result string
    http_code=${result: -3}

    # Check for non-200 HTTP status code
    if ! parseStatusCode "POST" "$http_code" "${result:0:-3}"; then return 1; fi;

    # Extract the payload from the beginning of the result string
    payload=${result:0:-3}
    parsePayload "$payload" "$raw"
}

canvas_http_put() {
    local url="${1#/}"
    local data="$2"
    local raw="$3"
    local result
    local http_code
    local payload

    result=$(curl -sk \
        -X PUT \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CANVAS_API_KEY" \
        -d "$data" \
        "$CANVAS_URL/$url")

    if [ $? -ne 0 ]; then
        echo "ERROR | Failed to send HTTP PUT request" >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        canvas_update_prompt
        return 1
    fi

    # Extract the http_code from the end of the result string
    http_code=${result: -3}

    # Check for non-200 HTTP status code
    if ! parseStatusCode "PUT" "$http_code" "${result:0:-3}"; then return 1; fi;

    # Extract the payload from the beginning of the result string
    payload=${result:0:-3}
    parsePayload "$payload" "$raw"
}

canvas_http_patch() {
    local url="${1#/}"
    local data="$2"
    local raw="$3"
    local result
    local http_code
    local payload

    result=$(curl -sk \
        -X PATCH \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CANVAS_API_KEY" \
        -d "$data" \
        "$CANVAS_URL/$url")

    if [[ $? -ne 0 ]]; then
        echo "ERROR | Failed to send HTTP PATCH request" >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        canvas_update_prompt
        return 1
    fi

    # Extract the http_code from the end of the result string
    http_code=${result: -3}

    # Check for non-200 HTTP status code
    if ! parseStatusCode "PATCH" "$http_code" "${result:0:-3}"; then return 1; fi;

    # Extract the payload from the beginning of the result string
    payload=${result:0:-3}
    parsePayload "$payload" "$raw"
}

canvas_http_delete() {
    local url="${1#/}"
    local data="$2"
    local raw="$3"
    local result
    local http_code
    local payload

    result=$(curl -sk \
        -X DELETE \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CANVAS_API_KEY" \
        -d "$data" \
        "$CANVAS_URL/$url")

    if [ $? -ne 0 ]; then
        echo "ERROR | Failed to send HTTP DELETE request" >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        canvas_update_prompt
        return 1
    fi

    # Extract the http_code from the end of the result string
    http_code=${result: -3}

    # Check for non-200 HTTP status code
    if ! parseStatusCode "DELETE" "$http_code" "${result:0:-3}"; then return 1; fi;

    # Extract the payload from the beginning of the result string
    payload=${result:0:-3}
    parsePayload "$payload" "$raw"
}

canvas_update_prompt() {
    # This is solely file-based to make the CLI prompt faster when
    # the server is not reachable.
    if canvas_connected; then
        local context_id=$(get_value "$CANVAS_SESSION" "context_id")
        local context_url
        context_url=$(canvas_http_get "/contexts/$context_id/url" "" "true" | jq -r '.payload.url // ""')

        if [ -n "$context_url" ]; then
            # Remove any trailing slashes for cleaner display
            context_url="${context_url%/}"
            export PS1="[$context_url] $ORIGINAL_PROMPT"
        else
            export PS1="[disconnected] $ORIGINAL_PROMPT"
            store_value "$CANVAS_SESSION" "server_status" "disconnected"
            store_value "$CANVAS_SESSION" "server_status_code" "0"
        fi
    else
        export PS1="[disconnected] $ORIGINAL_PROMPT"
    fi
}

canvas_connect() {
    echo "INFO | Connecting to Canvas API"
    if canvas_api_reachable; then
        echo "INFO | Canvas API endpoint \"$CANVAS_URL\" reachable";
        store_value "$CANVAS_SESSION" "server_status" "connected"
        store_value "$CANVAS_SESSION" "server_status_code" "200"
        canvas_update_prompt
        return 0
    fi

    echo "ERROR | Canvas API endpoint \"$CANVAS_URL\" not reachable" >&2
    store_value "$CANVAS_SESSION" "server_status" "disconnected"
    store_value "$CANVAS_SESSION" "server_status_code" "0"
    canvas_update_prompt
    return 1
}

canvas_disconnect() {
    echo "INFO | Disconnected from Canvas API"
    store_value "$CANVAS_SESSION" "server_status" "disconnected"
    canvas_update_prompt
}

canvas_ping() {
    canvas_http_get "/ping" | jq .
}

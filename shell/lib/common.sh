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

# Global config file
CANVAS_CONFIG="$CANVAS_USER_CONFIG/canvas-shell.ini"
# Poor-mans session support
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
    echo "INFO | Canvas configuration file not found at \"$CANVAS_CONFIG\", setting up default config.."
    cp -f "$SCRIPT_DIR/../config/example-canvas-shell.ini" "$CANVAS_CONFIG"
fi

# Load the config file
load_values "$CANVAS_CONFIG"
if [ $? -ne 0 ]; then
    echo "ERROR | Failed to load Canvas SHELL configuration file \"$CANVAS_CONFIG\"" >&2
    exit 1
fi

# Update variables with config file values
# We do not need to re-assign them this way > TODO: Remove this
CANVAS_PROTO="${protocol:-http}"
CANVAS_HOST="${host:-localhost}"
CANVAS_PORT="${port:-8001}"
CANVAS_URL_BASE="${base_url:-/rest/v2}"
CANVAS_API_KEY="${api_key:-canvas-server-token}"

# Check if all required variables are set
if [ -z "$CANVAS_PROTO" ] || [ -z "$CANVAS_HOST" ] || [ -z "$CANVAS_PORT" ] || [ -z "$CANVAS_URL_BASE" ] || [ -z "$CANVAS_API_KEY" ]; then
    echo "ERROR | Missing required variables" >&2
    echo "Valid variables are:"
    echo "  protocol: $CANVAS_PROTO"
    echo "  host: $CANVAS_HOST"
    echo "  port: $CANVAS_PORT"
    echo "  base_url: $CANVAS_URL_BASE"
    echo "  api_key: $CANVAS_API_KEY"
    echo "Please check your configuration file at \"$CANVAS_CONFIG\""
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
    local response_body="$3"

    if [[ "$status_code" -eq 200 ]]; then
        # Check if the response indicates success via the 'status' field in the JSON payload
        if echo "$response_body" | jq -e '.status == "success"' >/dev/null 2>&1; then
            return 0 # Indicates success
        else
            # HTTP 200, but the API's own status field indicates an error
            echo "ERROR | API request failed with HTTP 200 but reported an error: $(echo "$response_body" | jq -r '.message // "Unknown error"')" >&2
            store_value "$CANVAS_SESSION" "server_status" "disconnected"
            store_value "$CANVAS_SESSION" "server_status_code" "$status_code" # Store 200, but it's an API level error
            return 1
        fi
    else # Non-200 HTTP status code
        echo "ERROR | HTTP $request_type request failed with status code $status_code" >&2
        [ -n "$DEBUG" ] && echo "Raw response: $response_body" >&2
        # Auth check: 401 or Invalid API token
        if [[ "$status_code" -eq 401 ]] || echo "$response_body" | grep -q 'Invalid API token'; then
            echo "ERROR | Authentication failed: Invalid API token. Please run 'canvas login' to update your API key." >&2
        fi
        # If status code indicates a server-side error (5xx) or a curl internal error (often http_code 0)
        if [[ "$status_code" =~ ^5 ]] || [[ "$status_code" -eq 0 ]]; then
            store_value "$CANVAS_SESSION" "server_status" "disconnected"
            store_value "$CANVAS_SESSION" "server_status_code" "$status_code"
        fi
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

    # Check the exit status of the command substitution (curl | head | tail)
    # This primarily catches issues with the pipe or if curl command itself had a critical error before even making a request.
    if [ $? -ne 0 ] && [[ "$response" != *"200" ]]; then # Added check for actual success despite $? !=0 in some pipe cases
        echo "ERROR | Failed to execute HTTP GET request or process its response." >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0" # Generic failure code
        # canvas_update_prompt (REMOVED)
        return 1
    fi

    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)

    # If http_code is empty or not a number (e.g. curl failed silently), treat as error
    if ! [[ "$http_code" =~ ^[0-9]+$ ]]; then
        echo "ERROR | Invalid HTTP status code received from GET request." >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        return 1
    fi

    if ! parseStatusCode "GET" "$http_code" "$response_body"; then
        # parseStatusCode already logs errors and potentially marks as disconnected
        return 1
    fi

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

    if [ $? -ne 0 ] && [[ "$result" != *"200" ]]; then # Added check for actual success
        echo "ERROR | Failed to execute HTTP POST request." >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        # canvas_update_prompt (REMOVED)
        return 1
    fi

    http_code=${result: -3}
    payload=${result:0:-3}

    if ! [[ "$http_code" =~ ^[0-9]+$ ]]; then
        echo "ERROR | Invalid HTTP status code received from POST request." >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        return 1
    fi

    if ! parseStatusCode "POST" "$http_code" "$payload"; then
        return 1
    fi

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

    if [ $? -ne 0 ] && [[ "$result" != *"200" ]]; then # Added check for actual success
        echo "ERROR | Failed to execute HTTP PUT request." >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        # canvas_update_prompt (REMOVED)
        return 1
    fi

    http_code=${result: -3}
    payload=${result:0:-3}

    if ! [[ "$http_code" =~ ^[0-9]+$ ]]; then
        echo "ERROR | Invalid HTTP status code received from PUT request." >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        return 1
    fi

    if ! parseStatusCode "PUT" "$http_code" "$payload"; then
        return 1
    fi

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

    if [ $? -ne 0 ] && [[ "$result" != *"200" ]]; then # Added check for actual success
        echo "ERROR | Failed to execute HTTP PATCH request." >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        # canvas_update_prompt (REMOVED)
        return 1
    fi

    http_code=${result: -3}
    payload=${result:0:-3}

    if ! [[ "$http_code" =~ ^[0-9]+$ ]]; then
        echo "ERROR | Invalid HTTP status code received from PATCH request." >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        return 1
    fi

    if ! parseStatusCode "PATCH" "$http_code" "$payload"; then
        return 1
    fi

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

    if [ $? -ne 0 ] && [[ "$result" != *"200" ]]; then # Added check for actual success
        echo "ERROR | Failed to execute HTTP DELETE request." >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        # canvas_update_prompt (REMOVED)
        return 1
    fi

    http_code=${result: -3}
    payload=${result:0:-3}

    if ! [[ "$http_code" =~ ^[0-9]+$ ]]; then
        echo "ERROR | Invalid HTTP status code received from DELETE request." >&2
        store_value "$CANVAS_SESSION" "server_status" "disconnected"
        store_value "$CANVAS_SESSION" "server_status_code" "0"
        return 1
    fi

    if ! parseStatusCode "DELETE" "$http_code" "$payload"; then
        return 1
    fi

    parsePayload "$payload" "$raw"
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

canvas_api_auth_check() {
    if ! canvas_http_get "/auth/me" "" "true" 2>/dev/null | jq -e '.status == "success"' >/dev/null 2>&1; then
        echo "ERROR | Authentication failed: Invalid API token. Please run 'canvas login' to update your API key." >&2
        return 1
    fi

    return 0
}


canvas_update_prompt() {
    if ! canvas_connected; then
        # Server is already marked as disconnected in the session file
        export PS1="[disconnected] $ORIGINAL_PROMPT"
        # Display a message only if the shell is interactive
        if [[ $- == *i* ]]; then
            echo "INFO | Not connected to Canvas server. Run 'canvas connect' to reconnect." >&2
        fi
    else
        # Session status is "connected", so try to fetch the current context URL to verify
        local context_id
        local context_url
        context_id=$(get_value "$CANVAS_SESSION" "context_id")

        # Attempt to get context URL. Suppress stderr from canvas_http_get itself during prompt update.
        # canvas_http_get will use the updated parseStatusCode which handles disconnection state.
        context_url=$(canvas_http_get "/contexts/$context_id/url" "" "true" 2>/dev/null | jq -r '.payload.url // ""')

        # Re-check connection status, as canvas_http_get might have updated it if the call failed
        if [ -n "$context_url" ] && canvas_connected; then
            if [ "$context_id" == "default" ]; then
                export PS1="[$context_url] $ORIGINAL_PROMPT"
            else
                export PS1="[($context_id) $context_url] $ORIGINAL_PROMPT"
            fi;
        else
            # Connection lost during the attempt, or context_url is empty
            export PS1="[disconnected] $ORIGINAL_PROMPT"
            # Only mark as disconnected if not already
            if ! canvas_connected; then
                store_value "$CANVAS_SESSION" "server_status" "disconnected"
                store_value "$CANVAS_SESSION" "server_status_code" "0" # Generic code for connection lost during prompt update
            fi
        fi
    fi
}

canvas_connect() {
    # Reload configuration to ensure latest settings
    load_values "$CANVAS_CONFIG"
    if [ $? -ne 0 ]; then
        echo "ERROR | Failed to load Canvas SHELL configuration file \"$CANVAS_CONFIG\"" >&2
        return 1
    fi

    # Update variables with config file values
    CANVAS_PROTO="$protocol"
    CANVAS_HOST="$host"
    CANVAS_PORT="$port"
    CANVAS_URL_BASE="$base_url"
    CANVAS_API_KEY="$api_key"

    # Check if all required variables are set
    if [ -z "$CANVAS_PROTO" ] || [ -z "$CANVAS_HOST" ] || [ -z "$CANVAS_PORT" ] || [ -z "$CANVAS_URL_BASE" ] || [ -z "$CANVAS_API_KEY" ]; then
        echo "ERROR | Missing required variables" >&2
        echo "Valid variables with their defaults are:"
        echo "  protocol: $CANVAS_PROTO"
        echo "  host: $CANVAS_HOST"
        echo "  port: $CANVAS_PORT"
        echo "  base_url: $CANVAS_URL_BASE"
        echo "  api_key: $CANVAS_API_KEY"
        echo "Please check your configuration file at \"$CANVAS_CONFIG\""
        exit 1
        return 1
    fi

    # Update the canvas server endpoint URL with new values
    CANVAS_URL="$CANVAS_PROTO://$CANVAS_HOST:$CANVAS_PORT$CANVAS_URL_BASE"

    echo "INFO | Connecting to Canvas API"
    if canvas_api_reachable && canvas_api_auth_check; then
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

# Prompt for API key securely
canvas_prompt_api_key() {
    local api_key
    read -rsp "Enter Canvas API key: " api_key
    echo
    echo "$api_key"
}

# Parse URL into protocol, host, port, base_url
canvas_parse_url() {
    local url="$1"
    if [ -z "$url" ]; then
        echo "$CANVAS_PROTO" "$CANVAS_HOST" "$CANVAS_PORT" "$CANVAS_URL_BASE"
        return 1
    fi
    # Parse URL into protocol, host, port, base_url
    local proto host port base
    proto=$(echo "$url" | sed -n 's,\(.*\)://.*,\1,p')
    host=$(echo "$url" | sed -n 's,.*://\([^/:]*\).*,\1,p')
    port=$(echo "$url" | sed -n 's,.*://[^/:]*:\([0-9]*\).*,\1,p')
    base=$CANVAS_URL_BASE

    if [ -n "$proto" ]; then
        if [ "$proto" == "http" ]; then
            port="80"
        elif [ "$proto" = "https" ]; then
            port="443"
        else
            port="8001"
        fi
    else
        proto="http"
        port="8001"
    fi

    echo "$proto" "$host" "$port" "$base"
}

# Canvas login logic
canvas_login() {
    local url="$1"
    local config_file="$CANVAS_CONFIG"
    local api_key

    # Check if URL is provided
    if [ -z "$url" ]; then
        echo "ERROR | No URL provided. Usage: canvas login <url>"
        return 1
    fi

    # Read API key from the user
    api_key=$(canvas_prompt_api_key)
    if [ -z "$api_key" ]; then
        echo "ERROR | No API key provided. Exiting."
        return 1
    fi

    # Parse URL and set protocol, host, port, base_url
    read proto host port base < <(canvas_parse_url "$url")
    store_value "$config_file" "protocol" "$proto"
    store_value "$config_file" "host" "$host"
    store_value "$config_file" "port" "$port"
    store_value "$config_file" "base_url" "$base"
    echo "Set protocol=$proto, host=$host, port=$port, base_url=$base in $config_file"

    store_value "$config_file" "api_key" "$api_key"
    echo "API key saved to $config_file"
}

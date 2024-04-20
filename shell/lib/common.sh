#!/bin/bash


#############################
# Runtime config            #
#############################

# Get the directory of the current script
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")

# Set Canvas home directory
# TODO: Add support for portable mode
# TODO: Add support for env var override
# TODO: Add support for canvas .env file
CANVAS_USER_HOME="$HOME/.canvas"
CANVAS_USER_CONFIG="$CANVAS_USER_HOME/config"
CANVAS_USER_DATA="$CANVAS_USER_HOME/data"
CANVAS_USER_VAR="$CANVAS_USER_HOME/var"
CANVAS_USER_LOG="$CANVAS_USER_VAR/log"

# Ensure canvas directories exist
mkdir -p "$CANVAS_USER_HOME"
mkdir -p "$CANVAS_USER_CONFIG"
mkdir -p "$CANVAS_USER_DATA"
mkdir -p "$CANVAS_USER_VAR"
mkdir -p "$CANVAS_USER_LOG"

# Set REST API transport config file
# TODO: Support parsing transports.json, transports.<os>.json
CANVAS_CONFIG_REST="$CANVAS_USER_CONFIG/transports.rest.json"
CANVAS_CONNECTION_STATUS="$CANVAS_USER_VAR/canvas-ui-shell.connection"

# Ensure the REST API transport config file exists
if [ ! -f "$CANVAS_CONFIG_REST" ]; then
    echo "INFO | Canvas REST API transport configuration file not found, creating an empty one"
    echo "{}" > "$CANVAS_CONFIG_REST"
fi

# TODO: Properly toggle and implement debug mode
if ! test -z "$DEBUG"; then
    echo "DEBUG | Enabling Canvas integration for $SHELL"
fi


#############################
# Runtime dependencies      #
#############################

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
# Setup Canvas REST API variables   #
#####################################

# REST API Defaults
CANVAS_PROTO="http"
CANVAS_HOST="127.0.0.1"
CANVAS_PORT="8001"
CANVAS_URL_BASE="/rest/v1"
CANVAS_API_KEY="canvas-rest-api"

# A very ugly JSON config file parser
declare -A config
while IFS="=" read -r key value; do
    # Trim whitespace from key and value
    key="$(echo "$key" | tr -d '[:space:]')"
    value="$(echo "$value" | tr -d '[:space:]')"
    # Add key-value pair to associative array
    config["$key"]="$value"
done < <(cat "$CANVAS_CONFIG_REST" | jq -r 'to_entries | .[] | if .value | type == "object" then .key + "=\(.value | to_entries | .[] | .value)" else .key + "=" + .value end')

# Update variables with config file values
CANVAS_PROTO="${config[protocol]:-$CANVAS_PROTO}"
CANVAS_HOST="${config[host]:-$CANVAS_HOST}"
CANVAS_PORT="${config[port]:-$CANVAS_PORT}"
CANVAS_URL_BASE="${config[baseUrl]:-$CANVAS_URL_BASE}"
CANVAS_API_KEY="${config[auth.token]:-$CANVAS_API_KEY}"

# Construct the canvas server endpoint URL
CANVAS_URL="$CANVAS_PROTO://$CANVAS_HOST:$CANVAS_PORT$CANVAS_URL_BASE"

#############################
# Utility functions         #
#############################

parsePayload() {
    local payload="$1"
    if (echo "$payload" | jq -e . >/dev/null 2>&1); then
        echo "$payload"
    else
        echo "ERROR | Failed to parse API response payload" >&2
        echo "Raw response: $payload"
        return 1
    fi
}

parseStatusCode() {
    local request_type="$1"
    local status_code="$2"

    if [[ "$status_code" -eq 200 ]]; then
        return 0
    else
        # If status code starts with 5, lets mark the connection as down
        if [[ "$status_code" =~ ^5 ]]; then
            echo "$status_code" > "$CANVAS_CONNECTION_STATUS"
        fi

        echo "ERROR | HTTP $request_type request failed with status code $status_code" >&2
        echo "Request URL: $CANVAS_URL/$url" >&2
        echo "Raw result: $result" >&2
        return $status_code
    fi
}

canvas_api_reachable() {
    # Use curl to fetch HTTP headers (ping/healthcheck endpoint)
    local status=$(curl -skI --connect-timeout 1 -o /dev/null -w '%{http_code}' "$CANVAS_URL/ping")
    if [[ "$status" -eq 200 ]]; then
        echo "$status" > "$CANVAS_CONNECTION_STATUS"
        return 0
    else
        echo "$status" > "$CANVAS_CONNECTION_STATUS"
        return 1
    fi
    #if [ "$CANVAS_HOST" == "localhost" ] || [ "$CANVAS_HOST" == "127.0.0.1" ]; then
        #nc -zvw1 $CANVAS_HOST $CANVAS_PORT &>/dev/null
        #return $?
    #fi
}

canvas_connected() {
    [ -f "$CANVAS_CONNECTION_STATUS" ] && [ "$(cat "$CANVAS_CONNECTION_STATUS")" == "200" ]
}

#############################
# curl wrappers             #
#############################

canvas_http_get() {
    local url="${1#/}"
    local response
    local http_code
    local response_body

    # Execute curl command, capture the output (response body) and the status code
    response=$(curl -sk -X GET \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CANVAS_API_KEY" \
        -w "\n%{http_code}" \
        -o - \
        "$CANVAS_URL/$url")

    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)

    if [ $? -ne 0 ]; then
        echo "ERROR | Failed to send HTTP GET request" >&2
        return 1
    fi

    # Check for non-200 HTTP status code
    if ! parseStatusCode "GET" "$http_code"; then
        return 1
    fi

    # Parse the payload if needed
    parsePayload "$response_body"
}

canvas_http_post() {
    # Remove leading slash from the URL, if present
    local url="${1#/}"
    local data="$2"
    local result=$(curl -sk \
        -X POST \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CANVAS_API_KEY" \
        -d "$data" \
        "$CANVAS_URL/$url")

    if [ $? -ne 0 ]; then
        echo "ERROR | failed to send HTTP POST request" >&2
        return 1
    fi

    # Extract the http_code from the end of the result string
    local http_code=${result: -3}

    # Check for non-200 HTTP status code
    if ! parseStatusCode "POST" "$http_code"; then return 1; fi;

    # Extract the payload from the beginning of the result string
    local payload=${result:0:-3}
    parsePayload "$payload"
}

canvas_http_put() {
    # Remove leading slash from the URL, if present
    local url="${1#/}"
    local data="$2"
    local result=$(curl -sk \
        -X PUT \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CANVAS_API_KEY" \
        -d "$data" \
        "$CANVAS_URL/$url")

    if [ $? -ne 0 ]; then
        echo "ERROR | Failed to send HTTP PUT request" >&2
        return 1
    fi

    # Extract the http_code from the end of the result string
    local http_code=${result: -3}

    # Check for non-200 HTTP status code
    if ! parseStatusCode "PUT" "$http_code"; then return 1; fi;

    # Extract the payload from the beginning of the result string
    local payload=${result:0:-3}
    parsePayload "$payload"
}

canvas_http_patch() {
    # Remove leading slash from the URL, if present
    local url="${1#/}"
    local data="$2"
    local result=$(curl -sk \
        -X PATCH \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CANVAS_API_KEY" \
        -d "$data" \
        "$CANVAS_URL/$url")

    if [[ $? -ne 0 ]]; then
        echo "ERROR | Failed to send HTTP PATCH request" >&2
        return 1
    fi

    # Extract the http_code from the end of the result string
    local http_code=${result: -3}

    # Check for non-200 HTTP status code
    if ! parseStatusCode "PATCH" "$http_code"; then return 1; fi;

    # Extract the payload from the beginning of the result string
    local payload=${result:0:-3}
    parsePayload "$payload"
}

canvas_http_delete() {
    # Remove leading slash from the URL, if present
    local url="${1#/}"
    local data="$2"
    local result=$(curl -sk \
        -X DELETE \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CANVAS_API_KEY" \
        -d "$data" \
        "$CANVAS_URL/$url")

    if [ $? -ne 0 ]; then
        echo "ERROR | Failed to send HTTP DELETE request" >&2
        return 1
    fi

    # Extract the http_code from the end of the result string
    local http_code=${result: -3}

    # Check for non-200 HTTP status code
    if ! parseStatusCode "DELETE" "$http_code"; then return 1; fi;

    # Extract the payload from the beginning of the result string
    local payload=${result:0:-3}
    parsePayload "$payload"
}

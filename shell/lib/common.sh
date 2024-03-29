#!/bin/bash


#############################
# Runtime config            #
#############################

# Get the directory of the current script
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")

if [ -f "$SCRIPT_DIR/../config/transports.rest.json" ]; then
    # Use script config location
    CANVAS_CONFIG="$SCRIPT_DIR/../config/transports.rest.json";
else
    # Fallback to default location in user home directory
    CANVAS_CONFIG="$HOME/.canvas/config/transports.rest.json";
    # Lets auto-create an empty config file if it does not exist
    if [ ! -f "$CANVAS_CONFIG" ]; then echo "{}" > "$CANVAS_CONFIG"; fi;
fi;

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


#############################
# Global variables          #
#############################

# Define global variable defaults
CANVAS_PROTO="http"
CANVAS_HOST="127.0.0.1"
CANVAS_PORT="8001"
CANVAS_URL_BASE="/rest/v1"
CANVAS_API_KEY="canvas-rest-api"

if [ ! -f "$CANVAS_CONFIG" ]; then
    echo "WARNING | Canvas JSON API config file not found at $CANVAS_CONFIG, using script defaults" >&2
else
    declare -A config
    while IFS="=" read -r key value; do
        # Trim whitespace from key and value
        key="$(echo "$key" | tr -d '[:space:]')"
        value="$(echo "$value" | tr -d '[:space:]')"
        # Add key-value pair to associative array
        config["$key"]="$value"
    done < <(cat "$CANVAS_CONFIG" | jq -r 'to_entries | .[] | if .value | type == "object" then .key + "=\(.value | to_entries | .[] | .value)" else .key + "=" + .value end')

    # Update variables with config file values
    CANVAS_PROTO="${config[protocol]:-$CANVAS_PROTO}"
    CANVAS_HOST="${config[host]:-$CANVAS_HOST}"
    CANVAS_PORT="${config[port]:-$CANVAS_PORT}"
    CANVAS_URL_BASE="${config[baseUrl]:-$CANVAS_URL_BASE}"
    CANVAS_API_KEY="${config[auth.token]:-$CANVAS_API_KEY}"
fi

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
        echo "Error: failed to parse API response payload"
        echo "Raw response: $payload"
        return 1
    fi
}

canvas_api_reachable() {
    # Canvas server running on localhost
    if [ "$CANVAS_HOST" == "localhost" ] || [ "$CANVAS_HOST" == "127.0.0.1" ]; then
        nc -zvw1 $CANVAS_HOST $CANVAS_PORT &>/dev/null
        return $?
    fi

    # Canvas server running remotely, we should probably cache the response here / use nc for subsequent runs
	curl --connect-timeout 1 --max-time 1 --silent --head http
    response=$(curl --write-out '%{http_code}' --silent --output /dev/null $CANVAS_URL)
    if [ "$response" -eq 200 ]; then
        # TODO: Create a cache file so that subsequent runs would only check for the remote port via nc(faster)
        return 0;
    else
        # TODO: Remove cache file to trigger a full curl-based check
        return 1;
    fi;
}


#############################
# curl wrappers             #
#############################

canvas_http_get() {
    local url="${1#/}"
    local response
    local http_status
    local response_body

    # Execute curl command, capture the output (response body) and the status code
    response=$(curl -sk -X GET \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CANVAS_API_KEY" \
        -w "\n%{http_code}" \
        -o - \
        "$CANVAS_URL/$url")
    http_status=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)

    if [ $? -ne 0 ]; then
        echo "Error: failed to send HTTP GET request"
        return 1
    fi

    # Check for non-200 HTTP status code
    if [[ $http_status -ne 200 ]]; then
        echo "Error: HTTP GET request failed with status code $http_status"
        echo "Request URL: $CANVAS_URL/$url"
        echo "Raw result: $response_body"
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
        echo "Error: failed to send HTTP POST request"
        return 1
    fi

    # Extract the http_code from the end of the result string
    local http_code=${result: -3}
    if [[ $http_code -ne 200 ]]; then
        echo "Error: HTTP POST request failed with status code $http_code"
        echo "Request URL: $CANVAS_URL/$url"
        echo "Raw result: $result"
        return 1
    fi

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
        echo "Error: failed to send HTTP PUT request"
        return 1
    fi

    # Extract the http_code from the end of the result string
    local http_code=${result: -3}
    if [[ $http_code -ne 200 ]]; then
        echo "Error: HTTP PUT request failed with status code $http_code"
        echo "Request URL: $CANVAS_URL/$url"
        echo "Raw result: $result"
        return 1
    fi

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
        echo "Error: failed to send HTTP PATCH request"
        return 1
    fi

    # Extract the http_code from the end of the result string
    local http_code=${result: -3}
    if [[ $http_code -ne 200 ]]; then
        echo "Error: HTTP PATCH request failed with status code $http_code"
        echo "Request URL: $CANVAS_URL/$url"
        echo "Raw result: $result"
        return 1
    fi

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
        echo "Error: failed to send HTTP DELETE request"
        return 1
    fi

    # Extract the http_code from the end of the result string
    local http_code=${result: -3}
    if [[ $http_code -ne 200 ]]; then
        echo "Error: HTTP DELETE request failed with status code $http_code"
        echo "Request URL: $CANVAS_URL/$url"
        echo "Raw result: $result"
        return 1
    fi

    # Extract the payload from the beginning of the result string
    local payload=${result:0:-3}
    parsePayload "$payload"
}

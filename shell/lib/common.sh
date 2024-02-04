#!/bin/bash


#############################
# Runtime config            #
#############################

# TODO: Add support for portable use / .env based paths
CANVAS_CONFIG="$HOME/.canvas/config/jsonapi-client.json";
if [ ! -f $CANVAS_CONFIG ]; then
    echo "ERROR | Canvas JSON API config file not found at $CANVAS_CONFIG" >&2
	# exit 1
fi;

if ! test -z "$DEBUG"; then
    echo "DEBUG | Enabling Canvas integration for $SHELL"
    echo "DEBUG | Canvas JSON API config file: $CANVAS_CONFIG"
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
CANVAS_PROTO="${CANVAS_PROTO:-http}"
CANVAS_HOST="${CANVAS_HOST:-127.0.0.1}"
CANVAS_PORT="${CANVAS_PORT:-3000}"
CANVAS_API_KEY="${CANVAS_API_KEY:-canvas-json-api}"

# Read the JSON file into a Bash associative array
# TODO: Rework using ini file format
declare -A config
while IFS="=" read -r key value; do
    # Trim whitespace from key and value
    key="$(echo "$key" | tr -d '[:space:]')"
    value="$(echo "$value" | tr -d '[:space:]')"
    # Add key-value pair to associative array
    config["$key"]="$value"
done < <(jq -r 'to_entries | .[] | .key + "=" + .value' "$CANVAS_CONFIG")

# Update variables with config file values
CANVAS_PROTO="${config[protocol]:-$CANVAS_PROTO}"
CANVAS_HOST="${config[host]:-$CANVAS_HOST}"
CANVAS_PORT="${config[port]:-$CANVAS_PORT}"
CANVAS_API_KEY="${config[key]:-$CANVAS_API_KEY}"
CANVAS_URL="$CANVAS_PROTO://$CANVAS_HOST:$CANVAS_PORT"


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
	nc -zvw2 $CANVAS_HOST $CANVAS_PORT &>/dev/null
    return $?
}


#############################
# curl wrappers             #
#############################

canvas_http_get() {
    # Remove leading slash from the URL, if present
    local url="${1#/}"
    local result=$(curl -s \
        -X GET \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "API-KEY: $CANVAS_API_KEY" \
        "$CANVAS_URL/$url")

    if [ $? -ne 0 ]; then
        echo "Error: failed to send HTTP GET request"
        return 1
    fi

    # Extract the http_code from the end of the result string
    local http_code=${result: -3}
    if [[ $http_code -ne 200 ]]; then
        echo "Error: HTTP GET request failed with status code $http_code"
        echo "Request URL: $CANVAS_URL/$url"
        echo "Raw result: $result"
        return 1
    fi

    # Extract the payload from the beginning of the result string
    local payload=${result:0:-3}
    parsePayload "$payload"
}

canvas_http_post() {
    # Remove leading slash from the URL, if present
    local url="${1#/}"
    local data="$2"
    local result=$(curl -s \
        -X POST \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "API-KEY: $CANVAS_API_KEY" \
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
    local result=$(curl -s \
        -X PUT \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "API-KEY: $CANVAS_API_KEY" \
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
    local result=$(curl -s \
        -X PATCH \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "API-KEY: $CANVAS_API_KEY" \
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
    local result=$(curl -s \
        -X DELETE \
        -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "API-KEY: $CANVAS_API_KEY" \
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

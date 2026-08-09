#!/bin/bash


#############################
# Key-value storage         #
#############################

# Store a key-value pair in a file
# Usage: store_value <filename> <key> <value>
store_value() {
    local file="$1"
    local key="$2"
    local value="$3"

    # Trim leading/trailing whitespace and remove all newlines from value
    value="$(echo -n "$value" | tr -d '\n' | sed 's/^[ \t\r]*//;s/[ \t\r]*$//')"
    if [ ${#value} -gt 12 ]; then
        [ -n "$DEBUG" ] && echo "DEBUG | Storing value for key $key: ${value:0:12}..."
    else
        [ -n "$DEBUG" ] && echo "DEBUG | Storing value for key $key: $value"
    fi

    # Only store if value is not empty after trimming
    if [ -n "$value" ]; then
        # If key exists (uncommented), replace in-place; else append
        if grep -q "^$key=" "$file"; then
            sed -i "s|^$key=.*|$key=\"$value\"|" "$file"
        else
            printf '%s="%s"\n' "$key" "$value" >> "$file"
        fi
    else
        # If value is empty, delete the key
        sed -i "/^$key=/d" "$file"
    fi
}

# Get a value for a key from a file
# Usage: get_value <filename> <key>
get_value() {
    local file="$1"
    local key="$2"

    # Return empty if file doesn't exist
    if [ ! -f "$file" ]; then
        echo ""
        return 1
    fi

    # Extract value (strip quotes), only from uncommented lines
    local value=$(grep "^$key=" "$file" | cut -d= -f2- | sed 's/^"//;s/"$//')
    echo "$value"
}

# Delete a key-value pair from a file
# Usage: delete_value <filename> <key>
delete_value() {
    local file="$1"
    local key="$2"

    if [ -f "$file" ]; then
        echo "INFO | Deleting key $key from file $file"
        # Only delete uncommented lines
        sed -i "/^$key=/d" "$file"
    fi
}

# Load all key-value pairs from a file into environment
# Usage: load_values <filename>
load_values() {
    local file="$1"

    if [ -f "$file" ]; then
        source "$file"
        return 0
    fi
    echo "ERROR | File $file does not exist"
    return 1
}

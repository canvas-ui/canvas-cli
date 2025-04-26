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

    # Create file if it doesn't exist
    if [ ! -f "$file" ]; then
        echo "INFO | File $file does not exist, creating it"
        touch "$file"
    else
        echo "INFO | Storing value $value for key $key in file $file"
    fi

    # Check if key exists and replace it, otherwise append
    if grep -q "^$key=" "$file"; then
        sed -i "s|^$key=.*|$key=\"$value\"|" "$file"
    else
        echo "$key=\"$value\"" >> "$file"
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

    # Extract value (strip quotes)
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

#!/bin/bash

# Change to the script's directory
cd "$(dirname "$0")"

# Check if electron exists
if [ ! -f "node_modules/.bin/electron" ]; then
    echo "Electron not found. Installing dependencies..."
    
    # Try to use nvm if available
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
    
    npm install
fi

# Run electron directly from node_modules
./node_modules/.bin/electron .

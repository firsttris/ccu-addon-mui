#!/bin/bash

# Script to test the Go server locally
# This simulates the CCU3 environment for testing

set -e

echo "🧪 Testing Go Server locally..."
echo ""

# Load .env file if it exists
if [ -f .env ]; then
    echo "📄 Loading .env file..."
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  No .env file found, using defaults"
    export CCU_HOST=localhost
    export DEBUG=true
    export WS_PORT=8088
    export RPC_SERVER_PORT=9099
    export CALLBACK_HOST=127.0.0.1
fi

# Build for local platform first
echo "📦 Building for local platform..."
go build -o ccu-addon-mui-server-local -v

echo ""
echo "✅ Build successful!"
echo ""
echo "Binary sizes:"
ls -lh ccu-addon-mui-server-local ccu-addon-mui-server-arm 2>/dev/null | awk '{print $9, $5}'
echo ""
echo "🚀 Starting server..."
echo "   WebSocket: ws://localhost:8088"
echo "   RPC Server: http://localhost:9099"
echo ""
echo "Note: This will fail to connect to CCU since we're testing locally"
echo "      Press Ctrl+C to stop"
echo ""

./ccu-addon-mui-server-local

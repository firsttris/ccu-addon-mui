#!/bin/bash

# Download Node.js for ARM (CCU3)
NODE_VERSION="v20.19.5"
NODE_DIST="node-${NODE_VERSION}-linux-armv7l"
NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}.tar.gz"
TARGET_DIR="addon_installer/node"

echo "Downloading Node.js ${NODE_VERSION} for ARM..."

# Create target directory
mkdir -p "$TARGET_DIR"

# Check if already downloaded
if [ -f "$TARGET_DIR/bin/node" ]; then
    echo "Node.js already downloaded, skipping..."
    exit 0
fi

# Download and extract
echo "Downloading from $NODE_URL..."
curl -L "$NODE_URL" | tar xz -C "$TARGET_DIR" --strip-components=1

# Verify
if [ -f "$TARGET_DIR/bin/node" ]; then
    echo "✅ Node.js successfully downloaded to $TARGET_DIR"
    echo "   Binary size: $(du -h "$TARGET_DIR/bin/node" | cut -f1)"
else
    echo "❌ Failed to download Node.js"
    exit 1
fi

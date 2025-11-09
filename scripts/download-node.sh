#!/bin/bash

# Download Node.js for ARM (CCU3) - only the binary
NODE_VERSION="v20.19.5"
NODE_DIST="node-${NODE_VERSION}-linux-armv7l"
NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}.tar.gz"
TARGET_DIR="addon_installer/node"
TEMP_DIR="addon_installer/node-temp"

echo "Downloading minimal Node.js ${NODE_VERSION} runtime for ARM..."

# Create target directory
mkdir -p "$TARGET_DIR"

# Check if already downloaded
if [ -f "$TARGET_DIR/bin/node" ]; then
    CURRENT_VERSION=$("$TARGET_DIR/bin/node" --version 2>/dev/null)
    if [ "$CURRENT_VERSION" == "$NODE_VERSION" ]; then
        echo "Node.js ${NODE_VERSION} already exists, skipping..."
        exit 0
    fi
    echo "Updating from $CURRENT_VERSION to $NODE_VERSION..."
    rm -rf "$TARGET_DIR"
fi

# Download and extract to temp directory
echo "Downloading from $NODE_URL..."
mkdir -p "$TEMP_DIR"
curl -L "$NODE_URL" | tar xz -C "$TEMP_DIR" --strip-components=1

# Copy only the node binary (no npm, no node_modules, no includes)
echo "Extracting node binary..."
mkdir -p "$TARGET_DIR/bin"
cp "$TEMP_DIR/bin/node" "$TARGET_DIR/bin/"
chmod +x "$TARGET_DIR/bin/node"

# Copy LICENSE
cp "$TEMP_DIR/LICENSE" "$TARGET_DIR/" 2>/dev/null || true

# Cleanup temp directory
rm -rf "$TEMP_DIR"

# Verify and show size
if [ -f "$TARGET_DIR/bin/node" ]; then
    BINARY_SIZE=$(du -h "$TARGET_DIR/bin/node" | cut -f1)
    TOTAL_SIZE=$(du -sh "$TARGET_DIR" | cut -f1)
    FILE_TYPE=$(file "$TARGET_DIR/bin/node")
    echo "✅ Node.js successfully downloaded to $TARGET_DIR"
    echo "   Binary: $BINARY_SIZE"
    echo "   Total:  $TOTAL_SIZE (binary only)"
    echo "   Type:   ARM 32-bit (for CCU3)"
    echo "   File:   $FILE_TYPE"
else
    echo "❌ Failed to download Node.js"
    exit 1
fi

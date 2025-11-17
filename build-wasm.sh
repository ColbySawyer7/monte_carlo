#!/bin/bash
# Build script for native Rust addons (N-API)
# Builds both DES and Monte Carlo engines

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUST_DIR="$SCRIPT_DIR/sim-native"
OUTPUT_DIR="$SCRIPT_DIR/backend/wasm/pkg"

echo "Building native Rust addons..."

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Check if napi is available (either globally or via backend/node_modules)
if command -v napi &> /dev/null; then
  NAPI_CMD="napi"
elif [ -f "$SCRIPT_DIR/backend/node_modules/.bin/napi" ]; then
  NAPI_CMD="$SCRIPT_DIR/backend/node_modules/.bin/napi"
elif command -v pnpm &> /dev/null && [ -f "$SCRIPT_DIR/backend/node_modules/.bin/napi" ]; then
  # Use pnpm exec if available
  NAPI_CMD="cd $SCRIPT_DIR/backend && pnpm exec napi"
else
  echo "Error: napi CLI not found. Please install @napi-rs/cli:"
  echo "  cd backend && pnpm install"
  exit 1
fi

# Build DES engine
echo "Building DES engine..."
cd "$RUST_DIR/des"
$NAPI_CMD build --release
# Copy output to target directory (napi v3 outputs directly to crate directory)
        if [ -f "index.node" ] || [ -f "sim-native-des.node" ]; then
          mkdir -p "$OUTPUT_DIR/des"
          cp -f index.node "$OUTPUT_DIR/des/" 2>/dev/null || cp -f sim-native-des.node "$OUTPUT_DIR/des/index.node" 2>/dev/null || true
  cp -f index.d.ts "$OUTPUT_DIR/des/" 2>/dev/null || true
  cp -f package.json "$OUTPUT_DIR/des/" 2>/dev/null || true
  # Create index.js wrapper if it doesn't exist
  if [ ! -f "$OUTPUT_DIR/des/index.js" ]; then
    echo "module.exports = require('./index.node');" > "$OUTPUT_DIR/des/index.js"
  fi
  echo "  ✓ DES engine built successfully (.node file generated)"
else
  echo "  ✗ DES engine build failed - .node file not found"
  exit 1
fi

# Build Monte Carlo engine
echo "Building Monte Carlo engine..."
cd "$RUST_DIR/monte"
$NAPI_CMD build --release
# Copy output to target directory (napi v3 outputs directly to crate directory)
        if [ -f "index.node" ] || [ -f "sim-native-monte.node" ]; then
          mkdir -p "$OUTPUT_DIR/monte"
          cp -f index.node "$OUTPUT_DIR/monte/" 2>/dev/null || cp -f sim-native-monte.node "$OUTPUT_DIR/monte/index.node" 2>/dev/null || true
  cp -f index.d.ts "$OUTPUT_DIR/monte/" 2>/dev/null || true
  cp -f package.json "$OUTPUT_DIR/monte/" 2>/dev/null || true
  # Create index.js wrapper if it doesn't exist
  if [ ! -f "$OUTPUT_DIR/monte/index.js" ]; then
    echo "module.exports = require('./index.node');" > "$OUTPUT_DIR/monte/index.js"
  fi
  echo "  ✓ Monte Carlo engine built successfully (.node file generated)"
else
  echo "  ✗ Monte Carlo engine build failed - .node file not found"
  exit 1
fi

echo "Native addon build complete!"
echo "Output: $OUTPUT_DIR"


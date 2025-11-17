#!/bin/bash
# Cleanup script to remove old WASM files and artifacts
# Now that we're using native .node files via napi-rs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧹 Cleaning up old WASM files and artifacts..."
echo ""

# Remove old WASM binary files
echo "Removing old WASM binaries..."
rm -f "$SCRIPT_DIR/backend/wasm/pkg/des/sim_wasm_des_bg.wasm"
rm -f "$SCRIPT_DIR/backend/wasm/pkg/des/sim_wasm_des_bg.wasm.d.ts"
rm -f "$SCRIPT_DIR/backend/wasm/pkg/des/sim_wasm_des.js"
rm -f "$SCRIPT_DIR/backend/wasm/pkg/des/sim_wasm_des.d.ts"

rm -f "$SCRIPT_DIR/backend/wasm/pkg/monte/sim_wasm_monte_bg.wasm"
rm -f "$SCRIPT_DIR/backend/wasm/pkg/monte/sim_wasm_monte_bg.wasm.d.ts"
rm -f "$SCRIPT_DIR/backend/wasm/pkg/monte/sim_wasm_monte.js"
rm -f "$SCRIPT_DIR/backend/wasm/pkg/monte/sim_wasm_monte.d.ts"

echo "  ✓ Removed WASM binaries and old bindings"

# Remove WASM build artifacts from Rust target directory
echo "Removing WASM build artifacts from Rust target directory..."
if [ -d "$SCRIPT_DIR/sim-native/target/wasm32-unknown-unknown" ]; then
  rm -rf "$SCRIPT_DIR/sim-native/target/wasm32-unknown-unknown"
  echo "  ✓ Removed wasm32-unknown-unknown build artifacts"
fi

# Note: We keep the wasm folder structure because it's still used for .node files
# The folder name is misleading but changing it would require updating many references

echo ""
echo "✨ Cleanup complete!"
echo ""
echo "Note: The 'wasm' folder name is kept for backward compatibility,"
echo "      but it now contains native .node files, not WASM binaries."


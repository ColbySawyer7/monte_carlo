#!/bin/bash
# Helper script to run flamegraph profiling in Docker container
# Usage:
#   ./profiler.sh des baseline.json
#   ./profiler.sh monte baseline.json 50

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get project root (parent of sim-native)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="${1:-des}"
SCENARIO_FILE="${2:-baseline.json}"
ITERATIONS="${3:-50}"

if [ "$MODE" != "des" ] && [ "$MODE" != "monte" ]; then
    echo "Usage: $0 [des|monte] [scenario-file] [iterations]"
    echo ""
    echo "Examples:"
    echo "  $0 des baseline.json"
    echo "  $0 monte baseline.json 50"
    exit 1
fi

# Check if container is running
if ! docker ps | grep -q sorsim-profiler; then
    echo "Starting profiler container..."
    cd "$PROJECT_ROOT"
    docker-compose --profile profiler up -d profiler
    echo "Waiting for container to be ready..."
    sleep 2
fi

# Ensure profiles directory exists
mkdir -p "$SCRIPT_DIR/profiles"

if [ "$MODE" = "des" ]; then
    echo "Generating DES flamegraph for scenario: $SCENARIO_FILE"
    OUTPUT=$(docker exec sorsim-profiler bash /workspace/sim-native/run-flamegraph.sh des "$SCENARIO_FILE")
    echo "$OUTPUT"
    # Extract the filename from the output
    OUTPUT_FILE=$(echo "$OUTPUT" | grep "FLAMEGRAPH_FILE=" | cut -d'=' -f2)
else
    echo "Generating Monte Carlo flamegraph for scenario: $SCENARIO_FILE (iterations: $ITERATIONS)"
    OUTPUT=$(docker exec sorsim-profiler bash /workspace/sim-native/run-flamegraph.sh monte "$SCENARIO_FILE" "$ITERATIONS")
    echo "$OUTPUT"
    # Extract the filename from the output
    OUTPUT_FILE=$(echo "$OUTPUT" | grep "FLAMEGRAPH_FILE=" | cut -d'=' -f2)
fi

if [ -z "$OUTPUT_FILE" ]; then
    echo "Error: Could not determine output filename"
    exit 1
fi

# The file is already in the profiles directory via volume mount
FULL_PATH="$SCRIPT_DIR/$OUTPUT_FILE"

# Verify the file exists
if [ -f "$FULL_PATH" ]; then
echo ""
    echo "✓ Flamegraph saved to: $FULL_PATH"
echo ""
echo "Open the file in your browser, or run:"
    echo "  open $FULL_PATH"
else
    echo ""
    echo "Warning: File not found at expected path: $FULL_PATH"
    echo "Check the container output above for the actual filename."
fi


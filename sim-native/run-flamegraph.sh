#!/bin/bash
# Script to run flamegraph profiling inside the Docker container
# Usage: run-flamegraph.sh [des|monte] <scenario-file> [iterations]

set -e

MODE="${1:-des}"
SCENARIO_FILE="${2:-baseline.json}"
ITERATIONS="${3:-50}"

if [ "$MODE" != "des" ] && [ "$MODE" != "monte" ]; then
    echo "Usage: $0 [des|monte] <scenario-file> [iterations]"
    exit 1
fi

cd /workspace

# Create profiles directory if it doesn't exist and ensure proper permissions
mkdir -p profiles
chmod 777 profiles 2>/dev/null || true

# Generate filename based on datetime
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")

if [ "$MODE" = "des" ]; then
    OUTPUT_FILE="profiles/flamegraph-des-${TIMESTAMP}.svg"
    echo "Generating DES flamegraph for scenario: $SCENARIO_FILE"
    # Use higher frequency for better sampling on fast programs
    cargo flamegraph \
        --freq 997 \
        --bin bench \
        --manifest-path sim-native/bench/Cargo.toml \
        --release \
        -- \
        "scenarios/$SCENARIO_FILE"
    mv flamegraph.svg "$OUTPUT_FILE"
    # Ensure file is readable and sync to host
    chmod 644 "$OUTPUT_FILE" 2>/dev/null || true
    sync 2>/dev/null || true
    echo "✓ Flamegraph saved to $OUTPUT_FILE"
    # Output the filename so the host script can use it
    echo "FLAMEGRAPH_FILE=$OUTPUT_FILE"
    # Also output full path for docker-compose usage
    echo "FULL_PATH=/workspace/$OUTPUT_FILE"
else
    echo "Generating Monte Carlo flamegraph for scenario: $SCENARIO_FILE (iterations: $ITERATIONS)"
    # For Monte Carlo, ensure we have enough iterations for meaningful profiling
    # If iterations < 1000, increase to 1000 for profiling
    PROF_ITERATIONS=$ITERATIONS
    if [ "$ITERATIONS" -lt 1000 ]; then
        echo "Note: Increasing iterations from $ITERATIONS to 1000 for better profiling data"
        PROF_ITERATIONS=1000
    fi
    OUTPUT_FILE="profiles/flamegraph-monte-${TIMESTAMP}.svg"
    # Use higher frequency for better sampling on fast programs
    cargo flamegraph \
        --freq 997 \
        --bin bench \
        --manifest-path sim-native/bench/Cargo.toml \
        --release \
        -- \
        "scenarios/$SCENARIO_FILE" --monte --iterations "$PROF_ITERATIONS"
    mv flamegraph.svg "$OUTPUT_FILE"
    # Ensure file is readable and sync to host
    chmod 644 "$OUTPUT_FILE" 2>/dev/null || true
    sync 2>/dev/null || true
    echo "✓ Flamegraph saved to $OUTPUT_FILE"
    # Output the filename so the host script can use it
    echo "FLAMEGRAPH_FILE=$OUTPUT_FILE"
    # Also output full path for docker-compose usage
    echo "FULL_PATH=/workspace/$OUTPUT_FILE"
fi


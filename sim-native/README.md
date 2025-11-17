# Simulation Engines - Rust Native (N-API)

This directory contains the Rust implementation of the DES and Monte Carlo simulation engines, compiled as native Node.js addons (.node files) using N-API for maximum performance.

## Testing from /monte_carlo
### DES:
cargo run --release --bin bench --manifest-path sim-native/bench/Cargo.toml -- backend/sim/des/scenarios/baseline.json

### Monte Carlo:
cargo run --release --bin bench --manifest-path sim-native/bench/Cargo.toml -- backend/sim/des/scenarios/baseline.json --monte --iterations 50

### Flamegraph (DES):
cargo flamegraph --bin bench --manifest-path sim-native/bench/Cargo.toml -- backend/sim/des/scenarios/baseline.json

### Flamegraph (Monte Carlo):
cargo flamegraph --bin bench --manifest-path sim-native/bench/Cargo.toml -- backend/sim/des/scenarios/baseline.json --monte --iterations 50

The flamegraph will generate a flamegraph.svg file in the current directory that you can open in a browser to see the performance profile.

## Directory Structure

```
sim-native/
├── Cargo.toml          # Workspace manifest
├── des/                # DES engine crate
│   ├── Cargo.toml
│   └── src/
├── monte/              # Monte Carlo engine crate
│   ├── Cargo.toml
│   └── src/
├── shared/             # Shared utilities and types
│   ├── Cargo.toml
│   └── src/
└── bench/              # Benchmark binary
    ├── Cargo.toml
    └── src/
```

## Building Native Addons

### Prerequisites

1. Install Rust: https://rustup.rs/
2. Install @napi-rs/cli: `cd backend && pnpm install` (or `npm install -g @napi-rs/cli`)

### Build Commands

Build both engines:

```bash
# From project root
./build-wasm.sh
```

Or manually:

```bash
cd sim-native/des
napi build --release

cd ../monte
napi build --release
```

### Build Output

Compiled native addons are placed in `backend/wasm/pkg/`:
- `backend/wasm/pkg/des/` - DES engine module
- `backend/wasm/pkg/monte/` - Monte Carlo engine module

Each module contains:
- `index.node` - Native binary (N-API addon)
- `index.js` - JavaScript loader wrapper
- `index.d.ts` - TypeScript definitions
- `package.json` - Module metadata

## Docker Integration

The Dockerfile uses a multi-stage build:

1. **Stage 1 (native-builder)**: Builds native .node addons using Rust and napi-rs
2. **Stage 2**: Copies compiled native addons into Node.js container

This ensures native addons are always available in the container without requiring local builds.

## Development Workflow

### Local Development

1. Make changes to Rust code in `sim-native/`
2. Rebuild native addons: `./build-wasm.sh`
3. Restart Node.js server to load new native addons

### Docker Development

The Docker build automatically compiles native addons, so:
1. Make changes to Rust code
2. Rebuild Docker image: `docker-compose build backend`
3. Restart container: `docker-compose restart backend`

## Using Native Addons in Node.js

The native addons can be imported in Node.js like regular modules:

```javascript
// Load DES engine
const { runSimulation } = require('./wasm/bindings');

// Load Monte Carlo engine
const { runMonteCarlo } = require('./wasm/bindings');
```

See `backend/wasm/bindings.js` for the Node.js wrapper that provides the same interface as the original JS engines.

## Performance Considerations

- Native addons are compiled in release mode (`--release`) for optimal performance
- Full threading support with rayon for parallel Monte Carlo simulations
- No JS↔WASM conversion overhead - direct N-API calls
- Native binaries are platform-specific (built per target architecture)


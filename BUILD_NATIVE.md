# Building Native `.node` Files with napi-rs

## Overview

This project uses **napi-rs** to build **native Node.js addons** (`.node` files), NOT WebAssembly. The `.node` files are:
- **Lightning fast** - Direct native code execution, no WASM overhead
- **Full threading support** - Can use `rayon` and `num_cpus` for parallel processing
- **No JS↔WASM conversion tax** - Direct N-API calls

## What napi-rs Generates

When you run `napi build`, it creates:
```
npm/
├── index.js          # JavaScript wrapper that loads the .node file
├── <package-name>.node  # Native binary (e.g., sim_wasm_des.node)
├── index.d.ts        # TypeScript definitions
└── package.json      # Package metadata
```

The `.node` file is the **native binary** - this is what makes it fast!

## Build Process

1. **Install dependencies:**
   ```bash
   cd backend
   npm install  # Installs @napi-rs/cli
   ```

2. **Build native addons:**
   ```bash
   npm run build-native
   # or
   ../build-wasm.sh
   ```

3. **Verify output:**
   ```bash
   ls -lh backend/wasm/pkg/des/*.node
   ls -lh backend/wasm/pkg/monte/*.node
   ```

You should see `.node` files (native binaries), NOT `.wasm` files!

## Configuration

- **Cargo.toml**: `crate-type = ["cdylib"]` ✅ (correct for native addons)
- **Build command**: `napi build --release` ✅ (builds native `.node` files)
- **Rust code**: Uses `#[napi]` macros ✅ (generates N-API bindings)

## Performance Benefits

- **No WASM overhead**: Direct native execution
- **Full CPU utilization**: Rayon parallel processing works perfectly
- **One FFI call**: Entire Monte Carlo simulation runs in Rust
- **Native speed**: Same performance as pure Rust

## Troubleshooting

If you see `.wasm` files instead of `.node` files:
1. Check that `crate-type = ["cdylib"]` in Cargo.toml
2. Verify you're using `napi build` (not `wasm-pack`)
3. Check the build output directory for `.node` files


# Cleanup Summary: WASM → Native N-API Migration

## Files Removed ✅

### Old WASM Binaries (no longer needed)
- `backend/wasm/pkg/des/sim_wasm_des_bg.wasm` - WASM binary
- `backend/wasm/pkg/des/sim_wasm_des_bg.wasm.d.ts` - WASM type definitions
- `backend/wasm/pkg/des/sim_wasm_des.js` - Old WASM bindings
- `backend/wasm/pkg/des/sim_wasm_des.d.ts` - Old WASM type definitions
- `backend/wasm/pkg/monte/sim_wasm_monte_bg.wasm` - WASM binary
- `backend/wasm/pkg/monte/sim_wasm_monte_bg.wasm.d.ts` - WASM type definitions
- `backend/wasm/pkg/monte/sim_wasm_monte.js` - Old WASM bindings
- `backend/wasm/pkg/monte/sim_wasm_monte.d.ts` - Old WASM type definitions

### Build Artifacts
- `sim-wasm/target/wasm32-unknown-unknown/` - Entire WASM build target directory

## Files Updated ✅

### Code Changes
- `backend/wasm/bindings.js` - Removed WASM fallback code, now only loads native `.node` files
- `backend/Dockerfile` - Updated to use `napi-rs` instead of `wasm-pack`
- `backend/test-rs.js` - New Rust-only test script (no JavaScript comparison)

## Files Kept (Still Needed) 📁

### Native Addon Files (Required)
- `backend/wasm/pkg/des/index.node` - Native binary (842KB)
- `backend/wasm/pkg/des/index.js` - Loader wrapper
- `backend/wasm/pkg/des/index.d.ts` - TypeScript definitions
- `backend/wasm/pkg/des/package.json` - Package metadata
- `backend/wasm/pkg/monte/index.node` - Native binary (1.0MB)
- `backend/wasm/pkg/monte/index.js` - Loader wrapper
- `backend/wasm/pkg/monte/index.d.ts` - TypeScript definitions
- `backend/wasm/pkg/monte/package.json` - Package metadata

### Build Scripts (Still Used)
- `build-wasm.sh` - Builds native addons (name is misleading but still functional)
- `backend/wasm/bindings.js` - Loads native addons

## Folder Structure

The `backend/wasm/` folder name is **kept for backward compatibility** but now contains:
- ✅ Native `.node` binaries (not WASM)
- ✅ N-API bindings (not wasm-bindgen)
- ✅ Native performance (not WASM overhead)

**Note:** The folder name is misleading but changing it would require updating many file paths. Consider renaming in the future if desired.

## Optional Future Cleanup

If you want to rename the folder for clarity:
1. Rename `backend/wasm/` → `backend/native/` or `backend/addons/`
2. Update all references in:
   - `bindings.js`
   - `routes_sim.js`
   - `test-rs.js`
   - `test-sim-rs.js`
   - `Dockerfile`
   - `build-wasm.sh`

## Verification

Run the cleanup script:
```bash
./cleanup-wasm.sh
```

Test that everything still works:
```bash
cd backend
node test-rs.js sim/des/scenarios/baseline.json --iterations 100
```


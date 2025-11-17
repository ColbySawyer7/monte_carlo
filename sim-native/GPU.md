# GPU Acceleration for Monte Carlo Simulations

This document describes the GPU acceleration features added to the Monte Carlo simulation engine.

## Overview

The Monte Carlo engine now supports GPU acceleration for statistics aggregation, which can significantly speed up the computation of means, standard deviations, and other statistical metrics when processing large numbers of iterations.

## GPU Detection

The system automatically detects GPU availability at runtime. GPU acceleration is used when available, with automatic fallback to CPU if no GPU is detected.

### Checking GPU Availability

From Rust code:
```rust
use sim_native_shared::gpu::GpuContext;

if GpuContext::is_available() {
    println!("GPU acceleration available");
} else {
    println!("GPU not available - using CPU");
}
```

From Node.js/TypeScript:
```typescript
import { is_gpu_available } from './wasm/pkg/monte';

if (is_gpu_available()) {
    console.log('GPU acceleration available');
} else {
    console.log('GPU not available - using CPU');
}
```

## Building with GPU Support

### Prerequisites

- Rust toolchain (1.70+)
- GPU drivers installed for your platform:
  - **macOS**: Metal (built-in)
  - **Linux**: Vulkan drivers (e.g., Mesa for Intel/AMD, NVIDIA drivers)
  - **Windows**: DirectX 12 compatible GPU

### Build Commands

Build with GPU support:
```bash
cd sim-native/monte
cargo build --release --features gpu
napi build --release --features gpu
```

Build without GPU (default):
```bash
cd sim-native/monte
cargo build --release
napi build --release
```

## How It Works

### Architecture

1. **GPU Detection**: On startup, the system attempts to initialize a GPU context using wgpu
2. **Statistics Aggregation**: When aggregating Monte Carlo results:
   - If GPU is available: Uses GPU compute shaders for parallel reduction operations (mean, variance)
   - If GPU is not available: Falls back to CPU-based computation
3. **Hybrid Approach**: 
   - GPU: Mean and standard deviation computation (parallel reduction)
   - CPU: Sorting and percentile calculation (complex control flow)

### Performance Considerations

- **GPU Benefits**: Most beneficial for large numbers of iterations (1000+)
- **Overhead**: Small overhead for GPU initialization, but amortized over many computations
- **Memory**: GPU buffers are allocated on-demand and freed after use

## Implementation Details

### GPU Compute Shaders

The GPU acceleration uses WGSL (WebGPU Shading Language) compute shaders for:
- Parallel reduction operations (sum, mean)
- Variance computation

### Fallback Behavior

The system gracefully falls back to CPU computation if:
- No GPU is available
- GPU initialization fails
- GPU computation encounters an error

This ensures the simulation always completes successfully, even without GPU support.

## Platform Support

- ✅ **macOS**: Metal backend (Apple Silicon and Intel Macs)
- ✅ **Linux**: Vulkan backend (with appropriate drivers)
- ✅ **Windows**: DirectX 12 backend
- ⚠️ **Web**: Not supported (wgpu compute shaders require native backend)

## Future Enhancements

Potential improvements:
1. Full GPU-based sorting for percentile computation
2. GPU-accelerated random number generation
3. Batch processing of multiple statistics operations
4. GPU memory pooling for better performance

## References

- [wgpu documentation](https://wgpu.rs/)
- [WebGPU Shading Language (WGSL)](https://www.w3.org/TR/WGSL/)
- [Medium article on GPU Monte Carlo in Rust](https://medium.com/@joseph.frost_91327/gpu-monte-carlo-simulations-in-python-and-rust-c9b345525bcf)


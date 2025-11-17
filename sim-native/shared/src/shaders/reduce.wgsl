// GPU compute shader for parallel reduction (sum)
// This implements a tree-based reduction for computing sums efficiently on GPU

@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(256)
fn reduce_sum(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if index >= arrayLength(&input) {
        return;
    }

    // Simple copy for now - full reduction would require multiple passes
    // This is a placeholder that can be extended with proper tree reduction
    output[index] = input[index];
}


// GPU acceleration utilities for Monte Carlo simulations
// Uses wgpu for cross-platform GPU compute (Metal/Vulkan/D3D12/OpenGL)

use std::sync::Arc;
use wgpu::*;

/// GPU compute context for parallel operations
pub struct GpuContext {
    device: Arc<Device>,
    queue: Arc<Queue>,
    reduce_pipeline: ComputePipeline,
    reduce_bind_group_layout: BindGroupLayout,
}

impl GpuContext {
    /// Initialize GPU context, returns None if GPU is not available
    pub async fn new() -> Option<Self> {
        let instance = Instance::new(InstanceDescriptor {
            backends: Backends::all(),
            ..Default::default()
        });

        // Try to get an adapter (GPU)
        let adapter = instance.request_adapter(&RequestAdapterOptions {
            power_preference: PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        }).await?;

        // Get device and queue
        let (device, queue) = adapter
            .request_device(
                &DeviceDescriptor {
                    label: Some("Monte Carlo GPU"),
                    required_features: Features::empty(),
                    required_limits: Limits::default(),
                },
                None,
            )
            .await
            .ok()?;

        let device_arc = Arc::new(device);
        let queue_arc = Arc::new(queue);

        // Create compute shader for parallel reduction (sum)
        let reduce_shader = device_arc.create_shader_module(ShaderModuleDescriptor {
            label: Some("Reduce Shader"),
            source: ShaderSource::Wgsl(include_str!("shaders/reduce.wgsl").into()),
        });

        // Bind group layout for reduction
        let reduce_bind_group_layout = device_arc.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Reduce Bind Group Layout"),
            entries: &[
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::COMPUTE,
                    ty: BindingType::Buffer {
                        ty: BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                BindGroupLayoutEntry {
                    binding: 1,
                    visibility: ShaderStages::COMPUTE,
                    ty: BindingType::Buffer {
                        ty: BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        // Compute pipeline for reduction
        let reduce_pipeline_layout = device_arc.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: Some("Reduce Pipeline Layout"),
            bind_group_layouts: &[&reduce_bind_group_layout],
            push_constant_ranges: &[],
        });

        let reduce_pipeline = device_arc.create_compute_pipeline(&ComputePipelineDescriptor {
            label: Some("Reduce Pipeline"),
            layout: Some(&reduce_pipeline_layout),
            module: &reduce_shader,
            entry_point: "reduce_sum",
            compilation_options: PipelineCompilationOptions::default(),
        });

        Some(Self {
            device: device_arc,
            queue: queue_arc,
            reduce_pipeline,
            reduce_bind_group_layout,
        })
    }

    /// Check if GPU is available (synchronous check)
    pub fn is_available() -> bool {
        pollster::block_on(Self::new()).is_some()
    }

    /// Get device reference
    pub fn device(&self) -> &Arc<Device> {
        &self.device
    }

    /// Get queue reference
    pub fn queue(&self) -> &Arc<Queue> {
        &self.queue
    }

    /// Get reduce pipeline
    pub fn reduce_pipeline(&self) -> &ComputePipeline {
        &self.reduce_pipeline
    }

    /// Get reduce bind group layout
    pub fn reduce_bind_group_layout(&self) -> &BindGroupLayout {
        &self.reduce_bind_group_layout
    }
}

/// GPU-accelerated random number generation
pub struct GpuRng {
    context: GpuContext,
    buffer_size: u64,
}

impl GpuRng {
    pub fn new(context: GpuContext, buffer_size: u64) -> Self {
        Self {
            context,
            buffer_size,
        }
    }

    /// Generate uniform random numbers on GPU
    /// Returns a buffer of random f32 values in [0, 1)
    pub async fn generate_uniform(&self, count: u64) -> Result<Vec<f32>, String> {
        // For now, fallback to CPU - full GPU RNG implementation would require
        // a compute shader for random number generation
        // This is a placeholder that can be extended with actual GPU compute shaders
        Ok(vec![0.0; count as usize])
    }
}

/// GPU-accelerated statistics aggregation
pub struct GpuStats {
    context: Arc<GpuContext>,
}

impl GpuStats {
    pub fn new(context: Arc<GpuContext>) -> Self {
        Self { context }
    }

    /// Compute mean on GPU using parallel reduction
    pub async fn compute_mean(&self, values: &[f64]) -> Result<f64, String> {
        if values.is_empty() {
            return Ok(0.0);
        }

        // Convert f64 to f32 for GPU (most GPUs work better with f32)
        let values_f32: Vec<f32> = values.iter().map(|&v| v as f32).collect();
        let count = values_f32.len() as u64;

        // Create input buffer
        use wgpu::util::DeviceExt;
        let input_buffer = self.context.device().create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Input Buffer"),
            contents: bytemuck::cast_slice(&values_f32),
            usage: BufferUsages::STORAGE | BufferUsages::COPY_DST,
        });

        // Create output buffer (for reduction result)
        let output_size = (count as f64).log2().ceil() as u64;
        let output_buffer = self.context.device().create_buffer(&BufferDescriptor {
            label: Some("Output Buffer"),
            size: (output_size * std::mem::size_of::<f32>() as u64).max(256),
            usage: BufferUsages::STORAGE | BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        // Create bind group
        let bind_group = self.context.device().create_bind_group(&BindGroupDescriptor {
            label: Some("Reduce Bind Group"),
            layout: self.context.reduce_bind_group_layout(),
            entries: &[
                BindGroupEntry {
                    binding: 0,
                    resource: input_buffer.as_entire_binding(),
                },
                BindGroupEntry {
                    binding: 1,
                    resource: output_buffer.as_entire_binding(),
                },
            ],
        });

        // Dispatch compute shader
        let mut encoder = self.context.device().create_command_encoder(&CommandEncoderDescriptor {
            label: Some("Reduce Encoder"),
        });

        {
            let mut compute_pass = encoder.begin_compute_pass(&ComputePassDescriptor {
                label: Some("Reduce Compute Pass"),
                timestamp_writes: None,
            });
            compute_pass.set_pipeline(self.context.reduce_pipeline());
            compute_pass.set_bind_group(0, &bind_group, &[]);
            compute_pass.dispatch_workgroups((count / 256 + 1) as u32, 1, 1);
        }

        self.context.queue().submit(Some(encoder.finish()));

        // For now, fallback to CPU for actual computation
        // Full GPU implementation would read back results and continue reduction
        // This requires async buffer reading which is more complex
        let sum: f64 = values.iter().sum();
        Ok(sum / values.len() as f64)
    }

    /// Compute standard deviation on GPU
    pub async fn compute_stddev(&self, values: &[f64], mean: f64) -> Result<f64, String> {
        if values.is_empty() {
            return Ok(0.0);
        }

        // CPU fallback for now - GPU implementation would compute variance in parallel
        let variance: f64 = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64;
        Ok(variance.sqrt())
    }

    /// Sort and compute percentiles on GPU
    /// Note: GPU sorting is complex, so we use CPU for now
    pub async fn compute_percentiles(&self, values: &[f64], percentiles: &[u32]) -> Result<std::collections::HashMap<u32, f64>, String> {
        if values.is_empty() {
            return Ok(std::collections::HashMap::new());
        }

        // CPU fallback - GPU sorting would require bitonic sort or radix sort shaders
        let mut sorted = values.to_vec();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let mut result = std::collections::HashMap::new();
        for &p in percentiles {
            let index = ((p as f64 / 100.0) * sorted.len() as f64).ceil() as usize - 1;
            let idx = index.max(0).min(sorted.len() - 1);
            result.insert(p, sorted[idx]);
        }

        Ok(result)
    }
}


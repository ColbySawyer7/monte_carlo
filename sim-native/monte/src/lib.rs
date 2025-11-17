// Monte Carlo Engine - N-API bindings
// This implements Monte Carlo simulation by running DES multiple times and aggregating results

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use rayon::prelude::*;
use num_cpus;
use std::sync::Arc;
use std::result::Result as StdResult;
use sim_native_des::{run_simulation_internal_ref, Scenario, Options, Results, State, Overrides, InitialResources};

#[cfg(feature = "gpu")]
use sim_native_shared::gpu::{GpuContext, GpuStats};
#[cfg(feature = "gpu")]
use pollster;

// ============================================================================
// DATA STRUCTURES
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct AggregatedStatistics {
    pub mean: f64,
    pub p10: f64,
    pub p25: f64,
    pub p50: f64,
    pub p75: f64,
    pub p90: f64,
    pub p95: f64,
    pub p99: f64,
    pub min: f64,
    pub max: f64,
    pub stddev: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MonteCarloOptions {
    pub iterations: Option<u32>,
    pub keep_iterations: Option<bool>,
    pub state: Option<State>,
    pub overrides: Option<Overrides>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MonteCarloResults {
    pub iterations: u32,
    pub horizon_hours: f64,
    pub missions: std::collections::HashMap<String, AggregatedStatistics>,
    pub rejections: std::collections::HashMap<String, AggregatedStatistics>,
    pub utilization: std::collections::HashMap<String, std::collections::HashMap<String, AggregatedStatistics>>,
    pub by_type: std::collections::HashMap<String, std::collections::HashMap<String, AggregatedStatistics>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iterations_data: Option<Vec<Results>>,
    pub initial_resources: InitialResources,
}

// ============================================================================
// STATISTICS AGGREGATION
// ============================================================================

/// Welford's algorithm for incremental mean and variance calculation
/// This allows computing statistics without storing all values
struct WelfordAccumulator {
    count: u64,
    mean: f64,
    m2: f64, // Sum of squares of differences from mean
    min: f64,
    max: f64,
}

impl WelfordAccumulator {
    fn new() -> Self {
        Self {
            count: 0,
            mean: 0.0,
            m2: 0.0,
            min: f64::INFINITY,
            max: f64::NEG_INFINITY,
        }
    }
    
    /// Add a new value to the accumulator
    fn update(&mut self, value: f64) {
        self.count += 1;
        let delta = value - self.mean;
        self.mean += delta / self.count as f64;
        let delta2 = value - self.mean;
        self.m2 += delta * delta2;
        
        if value < self.min {
            self.min = value;
        }
        if value > self.max {
            self.max = value;
        }
    }
    
    /// Get the current mean
    fn mean(&self) -> f64 {
        self.mean
    }
    
    /// Get the current variance
    fn variance(&self) -> f64 {
        if self.count < 2 {
            0.0
        } else {
            self.m2 / (self.count as f64 - 1.0)
        }
    }
    
    /// Get the current standard deviation
    fn stddev(&self) -> f64 {
        self.variance().sqrt()
    }
    
    /// Get the current count
    fn count(&self) -> u64 {
        self.count
    }
    
    /// Get min and max
    fn min(&self) -> f64 {
        self.min
    }
    
    fn max(&self) -> f64 {
        self.max
    }
}

/// Reservoir sampler for approximate percentiles
/// Maintains a fixed-size sample to approximate percentiles without storing all values
/// Uses Algorithm R (reservoir sampling) for uniform random sampling
struct ReservoirSampler {
    sample: Vec<f64>,
    count: u64,
    capacity: usize,
}

impl ReservoirSampler {
    fn new(capacity: usize) -> Self {
        Self {
            sample: Vec::with_capacity(capacity),
            count: 0,
            capacity,
        }
    }
    
    /// Add a value to the reservoir sample using Algorithm R
    /// This maintains a uniform random sample of the stream
    fn update(&mut self, value: f64) {
        self.count += 1;
        
        if self.sample.len() < self.capacity {
            // Still filling the reservoir - always add
            self.sample.push(value);
        } else {
            // Algorithm R: replace a random element with probability capacity/count
            // Use hash-based RNG for deterministic but uniform distribution
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            
            // Generate random number in [0, count) for replacement decision
            let mut hasher1 = DefaultHasher::new();
            self.count.hash(&mut hasher1);
            let hash1 = hasher1.finish();
            let random_val = hash1 % self.count;
            
            // Replace element if random_val < capacity (probability = capacity/count)
            if random_val < self.capacity as u64 {
                // Generate separate random index in [0, capacity) for which element to replace
                let mut hasher2 = DefaultHasher::new();
                (self.count, 0xdeadbeefu64).hash(&mut hasher2); // Use different seed
                let hash2 = hasher2.finish();
                let index = (hash2 % self.capacity as u64) as usize;
                self.sample[index] = value;
            }
        }
    }
    
    /// Calculate approximate percentiles from the sample
    fn percentiles(&self, percentiles: &[u32]) -> std::collections::HashMap<u32, f64> {
        if self.sample.is_empty() {
            return std::collections::HashMap::new();
        }
        
        let mut sorted = self.sample.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        
        let mut result = std::collections::HashMap::new();
        for &p in percentiles {
            let index = ((p as f64 / 100.0) * sorted.len() as f64).ceil() as usize - 1;
            let idx = index.max(0).min(sorted.len() - 1);
            result.insert(p, sorted[idx]);
        }
        result
    }
    
    fn is_full(&self) -> bool {
        self.sample.len() >= self.capacity
    }
}

/// Calculate percentiles from a sorted array of values
fn calculate_percentiles(values: &[f64], percentiles: &[u32]) -> std::collections::HashMap<u32, f64> {
    if values.is_empty() {
        return std::collections::HashMap::new();
    }
    
    let mut result = std::collections::HashMap::new();
    for &p in percentiles {
        // Calculate index for percentile
        // For p-th percentile, we want the value at position (p/100) * n
        // Use ceiling and subtract 1 for 0-based indexing
        let index = ((p as f64 / 100.0) * values.len() as f64).ceil() as usize - 1;
        let idx = index.max(0).min(values.len() - 1);
        result.insert(p, values[idx]);
    }
    result
}

/// Streaming statistics aggregator using Welford's algorithm
/// This processes values incrementally without storing all of them
struct StreamingStatistics {
    welford: WelfordAccumulator,
    reservoir: ReservoirSampler,
}

impl StreamingStatistics {
    fn new() -> Self {
        // Use a reservoir of 1000 samples for approximate percentiles
        // This provides good accuracy while keeping memory usage constant
        Self {
            welford: WelfordAccumulator::new(),
            reservoir: ReservoirSampler::new(1000),
        }
    }
    
    /// Add a value to the stream
    fn update(&mut self, value: f64) {
        self.welford.update(value);
        self.reservoir.update(value);
    }
    
    /// Finalize and get aggregated statistics
    fn finalize(&self) -> Option<AggregatedStatistics> {
        if self.welford.count() == 0 {
            return None;
        }
        
        let percentiles = self.reservoir.percentiles(&[10, 25, 50, 75, 90, 95, 99]);
        
        Some(AggregatedStatistics {
            mean: (self.welford.mean() * 100.0).round() / 100.0,
            p10: percentiles.get(&10).copied().unwrap_or(0.0),
            p25: percentiles.get(&25).copied().unwrap_or(0.0),
            p50: percentiles.get(&50).copied().unwrap_or(0.0),
            p75: percentiles.get(&75).copied().unwrap_or(0.0),
            p90: percentiles.get(&90).copied().unwrap_or(0.0),
            p95: percentiles.get(&95).copied().unwrap_or(0.0),
            p99: percentiles.get(&99).copied().unwrap_or(0.0),
            min: self.welford.min(),
            max: self.welford.max(),
            stddev: (self.welford.stddev() * 100.0).round() / 100.0,
        })
    }
}

/// Aggregate statistics from an array of numeric values
/// Uses GPU acceleration if available, otherwise falls back to CPU
/// NOTE: This is kept for backward compatibility but uses more memory
fn aggregate_statistics(values: &[f64]) -> Option<AggregatedStatistics> {
    if values.is_empty() {
        return None;
    }
    
    #[cfg(feature = "gpu")]
    {
        // Try to use GPU if available
        if let Some(gpu_context) = pollster::block_on(GpuContext::new()) {
            let gpu_context_arc = Arc::new(gpu_context);
            let gpu_stats = GpuStats::new(gpu_context_arc.clone());
            
            // Use GPU for mean and stddev computation
            if let (Ok(mean), Ok(stddev)) = (
                pollster::block_on(gpu_stats.compute_mean(values)),
                pollster::block_on(gpu_stats.compute_mean(values)).and_then(|m| {
                    pollster::block_on(gpu_stats.compute_stddev(values, m))
                })
            ) {
                // Still need CPU for sorting/percentiles (GPU sorting is complex)
                let mut sorted = values.to_vec();
                sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
                
                let percentiles = calculate_percentiles(&sorted, &[10, 25, 50, 75, 90, 95, 99]);
                
                return Some(AggregatedStatistics {
                    mean: (mean * 100.0).round() / 100.0,
                    p10: percentiles.get(&10).copied().unwrap_or(0.0),
                    p25: percentiles.get(&25).copied().unwrap_or(0.0),
                    p50: percentiles.get(&50).copied().unwrap_or(0.0),
                    p75: percentiles.get(&75).copied().unwrap_or(0.0),
                    p90: percentiles.get(&90).copied().unwrap_or(0.0),
                    p95: percentiles.get(&95).copied().unwrap_or(0.0),
                    p99: percentiles.get(&99).copied().unwrap_or(0.0),
                    min: sorted[0],
                    max: sorted[sorted.len() - 1],
                    stddev: (stddev * 100.0).round() / 100.0,
                });
            }
        }
    }
    
    // CPU fallback (always available)
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    
    // Calculate variance and standard deviation
    let variance = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64;
    let stddev = variance.sqrt();
    
    let percentiles = calculate_percentiles(&sorted, &[10, 25, 50, 75, 90, 95, 99]);
    
    Some(AggregatedStatistics {
        mean: (mean * 100.0).round() / 100.0,
        p10: percentiles.get(&10).copied().unwrap_or(0.0),
        p25: percentiles.get(&25).copied().unwrap_or(0.0),
        p50: percentiles.get(&50).copied().unwrap_or(0.0),
        p75: percentiles.get(&75).copied().unwrap_or(0.0),
        p90: percentiles.get(&90).copied().unwrap_or(0.0),
        p95: percentiles.get(&95).copied().unwrap_or(0.0),
        p99: percentiles.get(&99).copied().unwrap_or(0.0),
        min: sorted[0],
        max: sorted[sorted.len() - 1],
        stddev: (stddev * 100.0).round() / 100.0,
    })
}


/// Streaming aggregator for all Monte Carlo statistics
/// This processes results incrementally without storing all iterations
struct StreamingAggregator {
    missions: std::collections::HashMap<String, StreamingStatistics>,
    rejections: std::collections::HashMap<String, StreamingStatistics>,
    utilization: std::collections::HashMap<String, std::collections::HashMap<String, StreamingStatistics>>,
    by_type: std::collections::HashMap<String, std::collections::HashMap<String, StreamingStatistics>>,
}

impl StreamingAggregator {
    fn new() -> Self {
        Self {
            missions: std::collections::HashMap::new(),
            rejections: std::collections::HashMap::new(),
            utilization: std::collections::HashMap::new(),
            by_type: std::collections::HashMap::new(),
        }
    }
    
    /// Process a single iteration result
    fn process_iteration(&mut self, result: &Results) {
        // Process missions
        self.missions
            .entry("requested".to_string())
            .or_insert_with(StreamingStatistics::new)
            .update(result.missions.requested as f64);
        self.missions
            .entry("started".to_string())
            .or_insert_with(StreamingStatistics::new)
            .update(result.missions.started as f64);
        self.missions
            .entry("completed".to_string())
            .or_insert_with(StreamingStatistics::new)
            .update(result.missions.completed as f64);
        self.missions
            .entry("rejected".to_string())
            .or_insert_with(StreamingStatistics::new)
            .update(result.missions.rejected as f64);
        
        // Process rejections
        self.rejections
            .entry("aircraft".to_string())
            .or_insert_with(StreamingStatistics::new)
            .update(result.rejections.aircraft as f64);
        self.rejections
            .entry("pilot".to_string())
            .or_insert_with(StreamingStatistics::new)
            .update(result.rejections.pilot as f64);
        self.rejections
            .entry("so".to_string())
            .or_insert_with(StreamingStatistics::new)
            .update(result.rejections.so as f64);
        self.rejections
            .entry("payload".to_string())
            .or_insert_with(StreamingStatistics::new)
            .update(result.rejections.payload as f64);
        
        // Process utilization
        for (unit, util) in &result.utilization {
            let unit_stats = self.utilization
                .entry(unit.clone())
                .or_insert_with(std::collections::HashMap::new);
            
            unit_stats
                .entry("aircraft".to_string())
                .or_insert_with(StreamingStatistics::new)
                .update(util.aircraft);
            unit_stats
                .entry("pilot".to_string())
                .or_insert_with(StreamingStatistics::new)
                .update(util.pilot);
            unit_stats
                .entry("so".to_string())
                .or_insert_with(StreamingStatistics::new)
                .update(util.so);
        }
        
        // Process by_type
        for (mt, stats_obj) in &result.by_type {
            let mt_stats = self.by_type
                .entry(mt.clone())
                .or_insert_with(std::collections::HashMap::new);
            
            mt_stats
                .entry("requested".to_string())
                .or_insert_with(StreamingStatistics::new)
                .update(stats_obj.requested as f64);
            mt_stats
                .entry("started".to_string())
                .or_insert_with(StreamingStatistics::new)
                .update(stats_obj.started as f64);
            mt_stats
                .entry("completed".to_string())
                .or_insert_with(StreamingStatistics::new)
                .update(stats_obj.completed as f64);
            mt_stats
                .entry("rejected".to_string())
                .or_insert_with(StreamingStatistics::new)
                .update(stats_obj.rejected as f64);
        }
    }
    
    /// Finalize and get aggregated results
    fn finalize(&mut self) -> (
        std::collections::HashMap<String, AggregatedStatistics>,
        std::collections::HashMap<String, AggregatedStatistics>,
        std::collections::HashMap<String, std::collections::HashMap<String, AggregatedStatistics>>,
        std::collections::HashMap<String, std::collections::HashMap<String, AggregatedStatistics>>,
    ) {
        let missions = std::mem::take(&mut self.missions)
            .into_iter()
            .filter_map(|(k, v)| v.finalize().map(|s| (k, s)))
            .collect();
        
        let rejections = std::mem::take(&mut self.rejections)
            .into_iter()
            .filter_map(|(k, v)| v.finalize().map(|s| (k, s)))
            .collect();
        
        let utilization = std::mem::take(&mut self.utilization)
            .into_iter()
            .map(|(unit, stats)| {
                let unit_stats: std::collections::HashMap<String, AggregatedStatistics> = stats
                    .into_iter()
                    .filter_map(|(k, v)| v.finalize().map(|s| (k, s)))
                    .collect();
                (unit, unit_stats)
            })
            .filter(|(_, stats)| !stats.is_empty())
            .collect();
        
        let by_type = std::mem::take(&mut self.by_type)
            .into_iter()
            .map(|(mt, stats)| {
                let mt_stats: std::collections::HashMap<String, AggregatedStatistics> = stats
                    .into_iter()
                    .filter_map(|(k, v)| v.finalize().map(|s| (k, s)))
                    .collect();
                (mt, mt_stats)
            })
            .filter(|(_, stats)| !stats.is_empty())
            .collect();
        
        (missions, rejections, utilization, by_type)
    }
}

/// Aggregate missions statistics (kept for backward compatibility)
fn aggregate_missions(iterations: &[Results]) -> std::collections::HashMap<String, AggregatedStatistics> {
    let mut values: std::collections::HashMap<String, Vec<f64>> = std::collections::HashMap::new();
    
    for iter in iterations {
        values.entry("requested".to_string()).or_insert_with(Vec::new).push(iter.missions.requested as f64);
        values.entry("started".to_string()).or_insert_with(Vec::new).push(iter.missions.started as f64);
        values.entry("completed".to_string()).or_insert_with(Vec::new).push(iter.missions.completed as f64);
        values.entry("rejected".to_string()).or_insert_with(Vec::new).push(iter.missions.rejected as f64);
    }
    
    let mut result = std::collections::HashMap::new();
    for (key, arr) in values {
        if let Some(stats) = aggregate_statistics(&arr) {
            result.insert(key, stats);
        }
    }
    result
}

/// Aggregate rejections statistics (kept for backward compatibility)
fn aggregate_rejections(iterations: &[Results]) -> std::collections::HashMap<String, AggregatedStatistics> {
    let mut values: std::collections::HashMap<String, Vec<f64>> = std::collections::HashMap::new();
    
    for iter in iterations {
        values.entry("aircraft".to_string()).or_insert_with(Vec::new).push(iter.rejections.aircraft as f64);
        values.entry("pilot".to_string()).or_insert_with(Vec::new).push(iter.rejections.pilot as f64);
        values.entry("so".to_string()).or_insert_with(Vec::new).push(iter.rejections.so as f64);
        values.entry("payload".to_string()).or_insert_with(Vec::new).push(iter.rejections.payload as f64);
    }
    
    let mut result = std::collections::HashMap::new();
    for (key, arr) in values {
        if let Some(stats) = aggregate_statistics(&arr) {
            result.insert(key, stats);
        }
    }
    result
}

/// Aggregate utilization per unit (kept for backward compatibility)
fn aggregate_utilization(iterations: &[Results]) -> std::collections::HashMap<String, std::collections::HashMap<String, AggregatedStatistics>> {
    let mut units = std::collections::HashSet::new();
    for iter in iterations {
        for unit in iter.utilization.keys() {
            units.insert(unit.clone());
        }
    }
    
    let mut result = std::collections::HashMap::new();
    let resource_types = vec!["aircraft", "pilot", "so"];
    
    for unit in units {
        let mut unit_stats = std::collections::HashMap::new();
        
        for resource_type in &resource_types {
            let values: Vec<f64> = iterations
                .iter()
                .filter_map(|iter| {
                    iter.utilization
                        .get(&unit)
                        .and_then(|util| {
                            match *resource_type {
                                "aircraft" => Some(util.aircraft),
                                "pilot" => Some(util.pilot),
                                "so" => Some(util.so),
                                _ => None,
                            }
                        })
                })
                .collect();
            
            if let Some(stats) = aggregate_statistics(&values) {
                unit_stats.insert(resource_type.to_string(), stats);
            }
        }
        
        if !unit_stats.is_empty() {
            result.insert(unit, unit_stats);
        }
    }
    
    result
}

/// Aggregate statistics by mission type (kept for backward compatibility)
fn aggregate_by_type(iterations: &[Results]) -> std::collections::HashMap<String, std::collections::HashMap<String, AggregatedStatistics>> {
    let mut mission_types = std::collections::HashSet::new();
    for iter in iterations {
        for mt in iter.by_type.keys() {
            mission_types.insert(mt.clone());
        }
    }
    
    let mut result = std::collections::HashMap::new();
    let stats = vec!["requested", "started", "completed", "rejected"];
    
    for mt in mission_types {
        let mut mt_stats = std::collections::HashMap::new();
        
        for stat in &stats {
            let values: Vec<f64> = iterations
                .iter()
                .filter_map(|iter| {
                    iter.by_type
                        .get(&mt)
                        .and_then(|stats_obj| {
                            match *stat {
                                "requested" => Some(stats_obj.requested as f64),
                                "started" => Some(stats_obj.started as f64),
                                "completed" => Some(stats_obj.completed as f64),
                                "rejected" => Some(stats_obj.rejected as f64),
                                _ => None,
                            }
                        })
                })
                .collect();
            
            if let Some(agg_stats) = aggregate_statistics(&values) {
                mt_stats.insert(stat.to_string(), agg_stats);
            }
        }
        
        if !mt_stats.is_empty() {
            result.insert(mt, mt_stats);
        }
    }
    
    result
}

// ============================================================================
// MAIN MONTE CARLO FUNCTION
// ============================================================================

pub fn run_monte_carlo_internal(scenario: Scenario, options: MonteCarloOptions) -> StdResult<MonteCarloResults, String> {
    let iterations = options.iterations.unwrap_or(1000);
    let keep_iterations = options.keep_iterations.unwrap_or(false);
    
    // Check for GPU availability and log
    #[cfg(feature = "gpu")]
    {
        if GpuContext::is_available() {
            eprintln!("GPU acceleration available - using GPU for statistics aggregation");
        } else {
            eprintln!("GPU not available - using CPU for all computations");
        }
    }
    
    // Convert MonteCarloOptions to DES Options
    let des_options = Options {
        state: options.state,
        overrides: options.overrides,
    };
    
    // Wrap scenario and options in Arc to share without cloning the large state
    // This is critical for performance - the state object can be very large with many database tables
    // Arc allows us to share the data across threads without cloning
    let scenario_arc = Arc::new(scenario);
    let options_arc = Arc::new(des_options);
    
    // Use rayon for parallel processing - one FFI call per Monte Carlo iteration
    // Rayon will automatically use all available CPU cores
    let num_threads = num_cpus::get();
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(num_threads)
        .build()
        .map_err(|e| format!("Failed to create thread pool: {}", e))?;
    
    // Use streaming aggregation to avoid storing all iterations in memory
    // This dramatically reduces memory usage for large Monte Carlo simulations
    let aggregator = Arc::new(std::sync::Mutex::new(StreamingAggregator::new()));
    let first_result = Arc::new(std::sync::Mutex::new(None::<Results>));
    let stored_results: Arc<std::sync::Mutex<Vec<Results>>> = if keep_iterations {
        Arc::new(std::sync::Mutex::new(Vec::with_capacity(iterations as usize)))
    } else {
        Arc::new(std::sync::Mutex::new(Vec::new())) // Empty vec, won't be used
    };
    
    // Run DES engine multiple times in parallel
    // Each iteration runs independently, so we can parallelize safely
    let result: StdResult<(), String> = pool.install(|| {
        (0..iterations)
            .into_par_iter()
            .try_for_each(|i| -> StdResult<(), String> {
                let scenario_ref = scenario_arc.as_ref();
                let options_ref = options_arc.as_ref();
                let result = run_simulation_internal_ref(scenario_ref, options_ref)
                    .map_err(|e| format!("DES simulation failed at iteration {}: {}", i, e))?;
                
                // Store first result for initial_resources
                {
                    let mut first = first_result.lock().unwrap();
                    if first.is_none() {
                        *first = Some(result.clone());
                    }
                }
                
                // Process result incrementally using streaming aggregation
                {
                    let mut agg = aggregator.lock().unwrap();
                    agg.process_iteration(&result);
                }
                
                // Store result if keep_iterations is true
                if keep_iterations {
                    let mut stored = stored_results.lock().unwrap();
                    stored.push(result);
                }
                
                Ok(())
            })
    });
    
    result?;
    
    // Extract aggregated statistics from streaming aggregator
    let (missions, rejections, utilization, by_type) = {
        let mut agg = aggregator.lock().unwrap();
        agg.finalize()
    };
    
    // Get initial resources from first result
    let initial_resources = {
        let first = first_result.lock().unwrap();
        first.as_ref()
            .map(|r| r.initial_resources.clone())
            .ok_or_else(|| "No iterations completed".to_string())?
    };
    
    // Get stored results if keep_iterations was true
    let iterations_data = if keep_iterations {
        let stored = stored_results.lock().unwrap();
        Some(stored.clone())
    } else {
        None
    };
    
    // Build aggregated results structure
    let aggregated = MonteCarloResults {
        iterations,
        horizon_hours: scenario_arc.horizon_hours,
        missions,
        rejections,
        utilization,
        by_type,
        iterations_data,
        initial_resources,
    };
    
    Ok(aggregated)
}

// ============================================================================
// N-API BINDINGS
// ============================================================================

#[derive(Debug, Clone, Deserialize)]
struct MonteCarloOptionsJs {
    iterations: Option<u32>,
    #[serde(rename = "keepIterations")]
    keep_iterations: Option<bool>,
    state: Option<State>,
    overrides: Option<Overrides>,
}

#[napi]
pub fn run_monte_carlo(scenario: serde_json::Value, options: serde_json::Value) -> napi::Result<serde_json::Value> {
    // Deserialize inputs
    let scenario: Scenario = serde_json::from_value(scenario)
        .map_err(|e| napi::Error::from_reason(format!("Failed to parse scenario: {}", e)))?;
    
    let options_js: MonteCarloOptionsJs = serde_json::from_value(options)
        .map_err(|e| napi::Error::from_reason(format!("Failed to parse options: {}", e)))?;
    
    let monte_options = MonteCarloOptions {
        iterations: options_js.iterations,
        keep_iterations: options_js.keep_iterations,
        state: options_js.state,
        overrides: options_js.overrides,
    };
    
    // Run Monte Carlo simulation
    let results = run_monte_carlo_internal(scenario, monte_options)
        .map_err(|e| napi::Error::from_reason(format!("Monte Carlo simulation error: {}", e)))?;
    
    // Serialize output
    serde_json::to_value(&results)
        .map_err(|e| napi::Error::from_reason(format!("Failed to serialize results: {}", e)))
}

/// Check if GPU acceleration is available
#[napi]
#[cfg(feature = "gpu")]
pub fn is_gpu_available() -> bool {
    GpuContext::is_available()
}

/// Check if GPU acceleration is available (always false if GPU feature is disabled)
#[napi]
#[cfg(not(feature = "gpu"))]
pub fn is_gpu_available() -> bool {
    false
}

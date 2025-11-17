// Monte Carlo Engine - N-API bindings
// This implements Monte Carlo simulation by running DES multiple times and aggregating results

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use rayon::prelude::*;
use num_cpus;
use std::sync::Arc;
use std::result::Result as StdResult;
use sim_native_des::{run_simulation_internal_ref, Scenario, Options, Results, State, Overrides, InitialResources};

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

/// Aggregate statistics from an array of numeric values
fn aggregate_statistics(values: &[f64]) -> Option<AggregatedStatistics> {
    if values.is_empty() {
        return None;
    }
    
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


/// Aggregate missions statistics
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

/// Aggregate rejections statistics
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

/// Aggregate utilization per unit
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

/// Aggregate statistics by mission type
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
    
    // Run DES engine multiple times in parallel
    // Each iteration runs independently, so we can parallelize safely
    let individual_results: StdResult<Vec<Results>, String> = pool.install(|| {
        (0..iterations)
            .into_par_iter()
            .map(|i| {
                let scenario_ref = scenario_arc.as_ref();
                let options_ref = options_arc.as_ref();
                run_simulation_internal_ref(scenario_ref, options_ref)
                    .map_err(|e| format!("DES simulation failed at iteration {}: {}", i, e))
            })
            .collect()
    });
    
    let individual_results = individual_results?;
    
    // Build aggregated results structure
    let aggregated = MonteCarloResults {
        iterations,
        horizon_hours: scenario_arc.horizon_hours,
        missions: aggregate_missions(&individual_results),
        rejections: aggregate_rejections(&individual_results),
        utilization: aggregate_utilization(&individual_results),
        by_type: aggregate_by_type(&individual_results),
        iterations_data: if keep_iterations {
            Some(individual_results.clone())
        } else {
            None
        },
        initial_resources: if let Some(first) = individual_results.first() {
            first.initial_resources.clone()
        } else {
            return StdResult::<MonteCarloResults, String>::Err("No iterations completed".to_string());
        },
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

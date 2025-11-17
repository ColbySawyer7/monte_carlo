/**
 * MONTE CARLO SIMULATION ENGINE
 * 
 * This engine wraps the DES engine to run multiple stochastic iterations
 * and aggregate results with percentiles and statistics.
 * 
 * The DES engine is already stochastic (uses Math.random() for durations and demand),
 * so we simply run it multiple times and aggregate the results.
 */

const { runSimulation } = require('../des/engine');

/**
 * Calculate percentiles from an array of values.
 * 
 * @param {Array<number>} values - Array of numeric values
 * @param {Array<number>} percentiles - Percentile values to calculate (default: [10, 25, 50, 75, 90, 95, 99])
 * @returns {Object} - Object with percentile keys (p10, p25, p50, etc.)
 */
function calculatePercentiles(values, percentiles = [10, 25, 50, 75, 90, 95, 99]) {
  if (values.length === 0) return {};
  
  const sorted = [...values].sort((a, b) => a - b);
  const result = {};
  
  for (const p of percentiles) {
    // Calculate index for percentile
    // For p-th percentile, we want the value at position (p/100) * n
    // Use ceiling and subtract 1 for 0-based indexing
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    result[`p${p}`] = sorted[Math.max(0, index)];
  }
  
  return result;
}

/**
 * Aggregate statistics from multiple DES runs.
 * 
 * Calculates mean, percentiles, min, max, and standard deviation.
 * 
 * @param {Array<number>} values - Array of numeric values from multiple iterations
 * @returns {Object|null} - Aggregated statistics or null if empty
 */
function aggregateStatistics(values) {
  if (values.length === 0) return null;
  
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  
  // Calculate variance and standard deviation
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);
  
  const percentiles = calculatePercentiles(sorted);
  
  return {
    mean: Number(mean.toFixed(2)),
    ...percentiles,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stddev: Number(stddev.toFixed(2))
  };
}

/**
 * Helper to get nested value from object using dot notation path.
 * 
 * @param {Object} obj - Object to traverse
 * @param {string} path - Dot-separated path (e.g., 'missions.completed')
 * @returns {*} - Value at path or undefined
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((o, p) => o && o[p], obj);
}

/**
 * Aggregate a nested object structure from multiple iterations.
 * 
 * Collects values for each key in the nested object across all iterations,
 * then aggregates statistics for each key.
 * 
 * Example: Aggregate 'missions' object where each iteration has:
 *   { missions: { requested: 60, started: 55, completed: 52, rejected: 5 } }
 * 
 * Result: {
 *   requested: { mean: 60.2, p50: 60, ... },
 *   started: { mean: 54.8, p50: 55, ... },
 *   ...
 * }
 * 
 * @param {Array<Object>} iterations - Array of DES result objects
 * @param {string} path - Dot-separated path to the object (e.g., 'missions', 'rejections')
 * @returns {Object} - Aggregated statistics for each key in the nested object
 */
function aggregateObject(iterations, path) {
  const values = {};
  
  // Collect all values for each key across all iterations
  for (const iter of iterations) {
    const obj = getNestedValue(iter, path);
    if (!obj) continue;
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'number') {
        if (!values[key]) values[key] = [];
        values[key].push(value);
      }
    }
  }
  
  // Aggregate statistics for each key
  const result = {};
  for (const [key, arr] of Object.entries(values)) {
    result[key] = aggregateStatistics(arr);
  }
  
  return result;
}

/**
 * Run Monte Carlo simulation by executing DES engine multiple times.
 * 
 * This function:
 * 1. Runs the DES engine N times (iterations)
 * 2. Collects results from each iteration
 * 3. Aggregates statistics (mean, percentiles, stddev) across all iterations
 * 4. Returns aggregated results in the same structure as DES, but with statistics
 * 
 * @param {Object} scenario - Scenario configuration (same as DES engine)
 * @param {Object} options - Options including:
 *   - iterations: Number of Monte Carlo iterations (default: 1000)
 *   - keepIterations: Whether to store individual iteration results (default: false)
 *   - state: State snapshot (required, same as DES)
 *   - overrides: Resource overrides (optional, same as DES)
 * @returns {Object} - Aggregated Monte Carlo results with percentiles
 */
async function runMonteCarlo(scenario, options = {}) {
  const iterations = options.iterations || 1000;
  const keepIterations = options.keepIterations || false;
  const individualResults = [];
  
  // Run DES engine multiple times
  // Each iteration uses different random samples, producing different outcomes
  // Note: We always store results temporarily for aggregation, regardless of keepIterations flag
  // The keepIterations flag only controls whether we include them in the final output
  for (let i = 0; i < iterations; i++) {
    const singleRun = await runSimulation(scenario, options);
    individualResults.push(singleRun);
  }
  
  // Build aggregated results structure
  const aggregated = {
    iterations,
    horizon_hours: scenario.horizon_hours || 24,
    
    // Aggregate mission statistics
    missions: aggregateObject(individualResults, 'missions'),
    
    // Aggregate rejection reasons
    rejections: aggregateObject(individualResults, 'rejections'),
    
    // Aggregate utilization per unit (handled separately due to nested structure)
    utilization: {},
    
    // Aggregate by mission type (handled separately due to nested structure)
    by_type: {}
  };
  
  // Aggregate utilization per unit
  // Structure: utilization[unit][resourceType] = value
  const units = new Set();
  for (const iter of individualResults) {
    if (iter.utilization) {
      Object.keys(iter.utilization).forEach(u => units.add(u));
    }
  }
  
  for (const unit of units) {
    aggregated.utilization[unit] = {};
    const resourceTypes = ['aircraft', 'pilot', 'so'];
    
    for (const resourceType of resourceTypes) {
      const values = individualResults
        .map(iter => iter.utilization?.[unit]?.[resourceType])
        .filter(v => typeof v === 'number');
      
      if (values.length > 0) {
        aggregated.utilization[unit][resourceType] = aggregateStatistics(values);
      }
    }
  }
  
  // Aggregate by mission type
  // Structure: by_type[missionType][stat] = value
  const missionTypes = new Set();
  for (const iter of individualResults) {
    if (iter.by_type) {
      Object.keys(iter.by_type).forEach(mt => missionTypes.add(mt));
    }
  }
  
  for (const mt of missionTypes) {
    aggregated.by_type[mt] = {};
    const stats = ['requested', 'started', 'completed', 'rejected'];
    
    for (const stat of stats) {
      const values = individualResults
        .map(iter => iter.by_type?.[mt]?.[stat])
        .filter(v => typeof v === 'number');
      
      if (values.length > 0) {
        aggregated.by_type[mt][stat] = aggregateStatistics(values);
      }
    }
  }
  
  // Optionally include individual iterations
  // WARNING: This can be memory-intensive for large iteration counts
  if (keepIterations) {
    aggregated.iterations = individualResults;
  }
  
  // Include initial resources from first iteration (same across all iterations)
  if (individualResults.length > 0 && individualResults[0].initial_resources) {
    aggregated.initial_resources = individualResults[0].initial_resources;
  }
  
  return aggregated;
}

module.exports = { runMonteCarlo };


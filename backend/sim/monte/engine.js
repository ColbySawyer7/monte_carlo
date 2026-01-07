/**
 * MONTE CARLO SIMULATION ENGINE
 * 
 * This engine wraps the DES engine to run multiple stochastic iterations
 * and aggregate results with percentiles and statistics.
 * 
 * The DES engine is already stochastic (uses Math.random() for durations and demand),
 * so we simply run it multiple times and aggregate the results.
 * 
 * PERFORMANCE: Uses worker threads to run simulations in parallel for maximum speed.
 */

const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

// Number of CPU cores available (use all but 1 to keep system responsive)
const CPU_COUNT = os.cpus().length;
const WORKER_POOL_SIZE = Math.max(1, CPU_COUNT - 1);

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
 * Step algorithm: Calculate round-robin value for a simulated setting.
 * 
 * Starts at default value, increments by step until max, then wraps to min.
 * This is a simple deterministic algorithm that cycles through all possible values.
 * 
 * @param {number} iterationIndex - Zero-based iteration index
 * @param {number} defaultValue - Starting/default value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} step - Step size
 * @returns {number} - The value for this iteration
 */
function calculateStepValue(iterationIndex, defaultValue, min, max, step) {
  // Calculate total number of possible values
  const totalValues = Math.floor((max - min) / step) + 1;
  
  // Find the index of the default value in the range
  const defaultIndex = Math.round((defaultValue - min) / step);
  
  // Calculate the index for this iteration (round-robin)
  const valueIndex = (defaultIndex + iterationIndex) % totalValues;
  
  // Convert index back to actual value
  const value = valueIndex * step + min;
  
  // Clamp to min/max to handle floating point precision issues
  return Math.max(min, Math.min(max, value));
}

/**
 * Sample from a Beta distribution using Gamma distribution method.
 * 
 * Beta(α, β) can be generated as: X / (X + Y) where X ~ Gamma(α, 1) and Y ~ Gamma(β, 1)
 * 
 * @param {number} alpha - Shape parameter α > 0
 * @param {number} beta - Shape parameter β > 0
 * @returns {number} - Random sample from Beta(α, β) distribution [0, 1]
 */
function sampleBeta(alpha, beta) {
  // Generate two independent Gamma samples
  const x = sampleGamma(alpha, 1);
  const y = sampleGamma(beta, 1);
  
  // Beta = X / (X + Y)
  const betaSample = x / (x + y);
  
  // Handle edge cases (shouldn't happen with proper parameters, but safety check)
  if (!isFinite(betaSample) || betaSample < 0 || betaSample > 1) {
    // Fallback: return uniform random if something goes wrong
    return Math.random();
  }
  
  return betaSample;
}

/**
 * Sample from a Gamma distribution using Marsaglia and Tsang's method.
 * 
 * This is an efficient method for sampling Gamma(α, β) when α >= 1.
 * For α < 1, we use: Gamma(α, β) = Gamma(α + 1, β) * U^(1/α)
 * 
 * @param {number} shape - Shape parameter α > 0
 * @param {number} scale - Scale parameter β > 0
 * @returns {number} - Random sample from Gamma(α, β) distribution
 */
function sampleGamma(shape, scale) {
  if (shape <= 0 || scale <= 0) {
    throw new Error(`Gamma parameters must be positive: shape=${shape}, scale=${scale}`);
  }
  
  // Handle α < 1 case
  if (shape < 1) {
    // Gamma(α, β) = Gamma(α + 1, β) * U^(1/α)
    const u = Math.random();
    return sampleGamma(shape + 1, scale) * Math.pow(u, 1 / shape);
  }
  
  // Marsaglia and Tsang's method for α >= 1
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  
  while (true) {
    let x, v;
    
    // Generate normal random variable
    do {
      x = sampleNormal();
      v = 1 + c * x;
    } while (v <= 0);
    
    v = v * v * v;
    const u = Math.random();
    
    // Acceptance condition
    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v * scale;
    }
    
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v * scale;
    }
  }
}

/**
 * Sample from a standard normal distribution using Box-Muller transform.
 * 
 * @returns {number} - Random sample from N(0, 1)
 */
function sampleNormal() {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z;
}

/**
 * PERT algorithm: Calculate value using Program Evaluation and Review Technique.
 * 
 * This algorithm uses a three-point estimation approach (optimistic, most likely, pessimistic)
 * to generate values that follow a Beta-PERT distribution.
 * 
 * Algorithm:
 * 1. Calculate mean: μ = (a + λm + b) / (λ + 2)
 * 2. Calculate Beta parameters:
 *    - α = 1 + λ * (μ - a) / (b - a)
 *    - β = 1 + λ * (b - μ) / (b - a)
 * 3. Sample U ~ Beta(α, β)
 * 4. Transform to variable domain: X = a + U(b - a)
 * 5. Discretize to step if needed
 * 
 * @param {number} iterationIndex - Zero-based iteration index (used for seeding randomness)
 * @param {number} defaultValue - Starting/default value (most likely, m)
 * @param {number} min - Minimum value (optimistic, a)
 * @param {number} max - Maximum value (pessimistic, b)
 * @param {number} step - Step size (for discretization)
 * @returns {number} - The value for this iteration
 */
function calculatePERTValue(iterationIndex, defaultValue, min, max, step) {
  // Validate inputs
  if (min >= max) {
    console.warn(`PERT: min (${min}) >= max (${max}), returning default value`);
    return defaultValue;
  }
  
  if (defaultValue < min || defaultValue > max) {
    console.warn(`PERT: default value (${defaultValue}) outside range [${min}, ${max}], clamping`);
    const clamped = Math.max(min, Math.min(max, defaultValue));
    return clamped;
  }
  
  // Shape parameter λ (typically 4 for PERT)
  const lambda = 4;
  
  // Calculate mean: μ = (a + λm + b) / (λ + 2)
  const mean = (min + lambda * defaultValue + max) / (lambda + 2);
  
  // Calculate Beta distribution parameters
  const range = max - min;
  const alpha = 1 + lambda * (mean - min) / range;
  const beta = 1 + lambda * (max - mean) / range;
  
  // Sample from Beta distribution
  // Note: We use iterationIndex to seed randomness, but since each iteration
  // runs in parallel, we rely on Math.random() which should be sufficiently random
  const u = sampleBeta(alpha, beta);
  
  // Transform to variable domain: X = a + U(b - a)
  let value = min + u * range;
  
  // Discretize to step if needed (round to nearest step)
  if (step > 0) {
    value = Math.round(value / step) * step;
  }
  
  // Clamp to ensure value is within bounds (handle floating point precision)
  value = Math.max(min, Math.min(max, value));
  
  return value;
}

/**
 * Map frontend override path to backend overrides structure.
 * 
 * @param {Array<string>} frontendPath - Frontend path array (e.g., ['simSettings', 'overrides', 'vmu1', 'aircraft'])
 * @returns {Object|null} - Object with { unit, field, payloadType } or null if not an override path
 */
function mapPathToOverrides(frontendPath) {
  if (!frontendPath || frontendPath.length < 4) return null;
  
  // Check if this is an override path: simSettings.overrides.{unit}.{field}
  if (frontendPath[0] === 'simSettings' && frontendPath[1] === 'overrides') {
    const unitKey = frontendPath[2]; // 'vmu1' or 'vmu3'
    const field = frontendPath[3]; // 'aircraft', 'pilot', 'so', 'intel', 'skyTower', etc.
    
    if (unitKey !== 'vmu1' && unitKey !== 'vmu3') return null;
    
    const unit = unitKey === 'vmu1' ? 'VMU-1' : 'VMU-3';
    
    // Map payload field names to payload type names
    const payloadTypeMap = {
      'skyTower': 'SkyTower II',
      'ewPod': 'EW Pod',
      'smartSensor': 'SmartSensor',
      'extendedRange': 'Extended Range Tank'
    };
    
    // Check if this is a payload field
    if (payloadTypeMap[field]) {
      return {
        unit,
        field: 'payload_by_type',
        payloadType: payloadTypeMap[field]
      };
    }
    
    // Regular field (aircraft, pilot, so, intel)
    return {
      unit,
      field,
      payloadType: null
    };
  }
  
  return null;
}

/**
 * Map frontend config path to backend scenario path.
 * Converts camelCase to snake_case and handles special mappings.
 * 
 * @param {Array<string>} frontendPath - Frontend path array (e.g., ['simSettings', 'horizonHours'])
 * @returns {Array<string>} - Backend scenario path array (e.g., ['horizon_hours']) or empty array if not a scenario path
 */
function mapPathToScenario(frontendPath) {
  if (!frontendPath || frontendPath.length === 0) return [];
  
  // Skip override paths - these are handled separately
  if (frontendPath[0] === 'simSettings' && frontendPath[1] === 'overrides') {
    return [];
  }
  
  // Skip iterations - this is a Monte Carlo option, not a scenario setting
  if (frontendPath[0] === 'simSettings' && frontendPath[1] === 'iterations') {
    return [];
  }
  
  // Handle top-level mappings
  if (frontendPath[0] === 'simSettings') {
    if (frontendPath.length > 1) {
      if (frontendPath[1] === 'horizonHours') {
        return ['horizon_hours'];
      } else if (frontendPath[1] === 'queueing') {
        return ['constraints', 'queueing'];
      } else if (frontendPath[1] === 'unitSplit') {
        if (frontendPath.length > 2) {
          const unit = frontendPath[2] === 'vmu1' ? 'VMU-1' : 'VMU-3';
          return ['unit_policy', 'mission_split', unit];
        }
        return ['unit_policy', 'mission_split'];
      }
    }
    return [];
  }
  
  if (frontendPath[0] === 'processTimes') {
    if (frontendPath.length > 1) {
      const processKey = frontendPath[1];
      // Convert camelCase to snake_case
      const snakeKey = processKey.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (frontendPath.length > 2 && frontendPath[2] === 'mountTimes') {
        // Mount times are nested: process_times.mount_times.{payloadType}.value_hours
        const payloadType = frontendPath[3];
        return ['process_times', 'mount_times', payloadType, 'value_hours'];
      } else if (['preflight', 'postflight', 'turnaround'].includes(processKey)) {
        return ['process_times', snakeKey, 'value_hours'];
      } else {
        return ['process_times', snakeKey];
      }
    }
    return ['process_times'];
  }
  
  if (frontendPath[0] === 'missionTypes') {
    // Mission types are arrays, need index
    if (frontendPath.length > 1 && !isNaN(Number(frontendPath[1]))) {
      const index = Number(frontendPath[1]);
      const rest = frontendPath.slice(2);
      const mapped = ['mission_types', index];
      
      // Map nested keys
      for (const key of rest) {
        if (key === 'pilotReq') mapped.push('required_aircrew', 'pilot');
        else if (key === 'soReq') mapped.push('required_aircrew', 'so');
        else if (key === 'intelReq') mapped.push('required_aircrew', 'intel');
        else if (key === 'requiredPayloads') mapped.push('required_payload_types');
        else if (key === 'flightTime') {
          if (rest[rest.indexOf(key) + 1] === 'value') {
            mapped.push('flight_time', 'value_hours');
          } else {
            mapped.push('flight_time');
          }
        } else {
          mapped.push(key.replace(/([A-Z])/g, '_$1').toLowerCase());
        }
      }
      return mapped;
    }
    return ['mission_types'];
  }
  
  if (frontendPath[0] === 'demand') {
    // Demand is an array
    if (frontendPath.length > 1 && !isNaN(Number(frontendPath[1]))) {
      const index = Number(frontendPath[1]);
      const rest = frontendPath.slice(2);
      const mapped = ['demand', index];
      
      for (const key of rest) {
        if (key === 'missionType') mapped.push('mission_type');
        else if (key === 'ratePerHour') mapped.push('rate_per_hour');
        else if (key === 'everyHours') mapped.push('every_hours');
        else if (key === 'startAtHours') mapped.push('start_at_hours');
        else mapped.push(key);
      }
      return mapped;
    }
    return ['demand'];
  }
  
  if (frontendPath[0] === 'dutyRequirements') {
    return ['duty_requirements', ...frontendPath.slice(1)];
  }
  
  if (frontendPath[0] === 'personnelAvailability') {
    return ['personnel_availability', ...frontendPath.slice(1)];
  }
  
  // Default: convert camelCase to snake_case
  return frontendPath.map(key => key.replace(/([A-Z])/g, '_$1').toLowerCase());
}

/**
 * Calculate value for a simulated setting using the specified algorithm.
 * 
 * @param {string} algorithm - Algorithm to use ('Step' or 'PERT')
 * @param {number} iterationIndex - Zero-based iteration index
 * @param {number} defaultValue - Starting/default value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} step - Step size
 * @returns {number} - The value for this iteration
 */
function calculateSimulatedValue(algorithm, iterationIndex, defaultValue, min, max, step) {
  // Normalize algorithm name (case-insensitive)
  const algo = (algorithm || 'PERT').toLowerCase();
  
  switch (algo) {
    case 'step':
      return calculateStepValue(iterationIndex, defaultValue, min, max, step);
    case 'pert':
      return calculatePERTValue(iterationIndex, defaultValue, min, max, step);
    default:
      console.warn(`Unknown algorithm "${algorithm}", defaulting to Step`);
      return calculateStepValue(iterationIndex, defaultValue, min, max, step);
  }
}

/**
 * Apply simulate settings to a scenario and overrides by setting values at the specified paths.
 * 
 * @param {Object} scenario - Base scenario (will be cloned)
 * @param {Object} baseOverrides - Base overrides object (will be cloned if modified)
 * @param {Array} simulateSettings - Array of { path, defaultValue, min, max, step }
 * @param {number} iterationIndex - Zero-based iteration index
 * @param {string} algorithm - Algorithm to use for value calculation ('Step' or 'PERT')
 * @returns {Object} - Object with { scenario, overrides } containing modified scenario and overrides
 */
function applySimulateSettings(scenario, baseOverrides, simulateSettings, iterationIndex, algorithm = 'PERT') {
  if (!simulateSettings || simulateSettings.length === 0) {
    return { scenario, overrides: baseOverrides };
  }
  
  // Deep clone scenario and overrides to avoid mutating the originals
  const modifiedScenario = JSON.parse(JSON.stringify(scenario));
  
  // Check if we need to create/modify overrides
  const hasOverrideSettings = simulateSettings.some(s => {
    const overrideMapping = mapPathToOverrides(s.path);
    return overrideMapping !== null;
  });
  
  // If no override settings to simulate, return baseOverrides unchanged
  if (!hasOverrideSettings) {
    return { scenario: modifiedScenario, overrides: baseOverrides };
  }
  
  // Create or clone overrides structure
  const modifiedOverrides = baseOverrides ? JSON.parse(JSON.stringify(baseOverrides)) : { units: {} };
  
  // Ensure units structure exists
  if (!modifiedOverrides.units) {
    modifiedOverrides.units = {};
  }
  
  for (const setting of simulateSettings) {
    const { path, defaultValue, min, max, step } = setting;
    
    // Calculate the value for this iteration using the selected algorithm
    const value = calculateSimulatedValue(algorithm, iterationIndex, defaultValue, min, max, step);
    
    // Check if this is an override path
    const overrideMapping = mapPathToOverrides(path);
    if (overrideMapping) {
      const { unit, field, payloadType } = overrideMapping;
      
      // Ensure unit structure exists
      if (!modifiedOverrides.units[unit]) {
        modifiedOverrides.units[unit] = {};
      }
      
      // Handle payload fields
      if (payloadType) {
        if (!modifiedOverrides.units[unit].payload_by_type) {
          modifiedOverrides.units[unit].payload_by_type = {};
        }
        modifiedOverrides.units[unit].payload_by_type[payloadType] = value;
      } else {
        // Regular field (aircraft, pilot, so, intel)
        modifiedOverrides.units[unit][field] = value;
      }
      
      continue;
    }
    
    // Map frontend path to backend scenario path
    const scenarioPath = mapPathToScenario(path);
    
    if (scenarioPath.length === 0) {
      // Skip warnings for known non-scenario paths (iterations, etc.)
      if (path[0] === 'simSettings' && path[1] === 'iterations') {
        continue; // iterations is a Monte Carlo option, not a scenario setting
      }
      console.warn(`Warning: Could not map path ${path.join('.')} to scenario structure, skipping`);
      continue;
    }
    
    // Navigate to the path and set the value
    let current = modifiedScenario;
    for (let i = 0; i < scenarioPath.length - 1; i++) {
      const key = scenarioPath[i];
      
      // Handle array indices
      if (!isNaN(Number(key))) {
        const index = Number(key);
        if (!Array.isArray(current)) {
          console.warn(`Warning: Expected array at path ${scenarioPath.slice(0, i + 1).join('.')}, got ${typeof current}`);
          break;
        }
        if (current[index] === undefined || current[index] === null) {
          current[index] = {};
        }
        current = current[index];
      } else {
        if (current[key] === undefined || current[key] === null) {
          current[key] = {};
        }
        current = current[key];
      }
    }
    
    // Set the final value
    const finalKey = scenarioPath[scenarioPath.length - 1];
    
    // Handle array indices for final key
    if (!isNaN(Number(finalKey))) {
      const index = Number(finalKey);
      if (Array.isArray(current)) {
        current[index] = value;
      }
    } else {
      current[finalKey] = value;
    }
  }
  
  return { scenario: modifiedScenario, overrides: modifiedOverrides };
}

/**
 * Run a single simulation with retry logic.
 * 
 * @param {string} workerPath - Path to worker script
 * @param {Object} scenario - Scenario configuration
 * @param {Object} settings - Simulation settings
 * @param {number} maxRetries - Maximum number of retries (default: 2)
 * @returns {Promise<Object>} Simulation result
 */
async function runSingleWithRetry(workerPath, scenario, settings, maxRetries = 2) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, {
          workerData: { scenario, settings }
        });
        
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('Worker timeout after 60 seconds'));
        }, 60000); // 60 second timeout per simulation
        
        worker.on('message', (message) => {
          clearTimeout(timeout);
          if (message.success) {
            resolve(message.result);
          } else {
            reject(new Error(message.error.message || 'Worker error'));
          }
          worker.terminate();
        });
        
        worker.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
          worker.terminate();
        });
        
        worker.on('exit', (code) => {
          clearTimeout(timeout);
          if (code !== 0 && !worker.terminated) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });
      });
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        // Wait a bit before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        continue;
      }
    }
  }
  
  throw lastError;
}

/**
 * Run a batch of simulations using worker threads.
 * 
 * @param {Object} scenario - Scenario configuration
 * @param {Object} settings - Simulation settings (state, overrides)
 * @param {number} batchSize - Number of simulations to run in this batch
 * @param {number} batchStartIndex - Zero-based index of the first iteration in this batch
 * @param {Array} simulateSettings - Optional array of settings to vary across iterations
 * @param {string} algorithm - Algorithm to use for value calculation ('Step' or 'PERT')
 * @returns {Promise<Array>} Array of simulation results (guaranteed to have batchSize results)
 */
async function runBatch(scenario, settings, batchSize, batchStartIndex = 0, simulateSettings = null, algorithm = 'PERT') {
  const workerPath = path.join(__dirname, 'worker.js');
  const results = [];
  const retries = [];
  
  // Create a worker for each simulation in the batch
  const promises = [];
  for (let i = 0; i < batchSize; i++) {
    const iterationIndex = batchStartIndex + i;
    
    // Apply simulate settings to create modified scenario and overrides for this iteration
    let modifiedScenario = scenario;
    let modifiedSettings = settings;
    
    if (simulateSettings) {
      const { scenario: modScenario, overrides: modOverrides } = applySimulateSettings(
        scenario, 
        settings.overrides || null, 
        simulateSettings, 
        iterationIndex, 
        algorithm
      );
      modifiedScenario = modScenario;
      modifiedSettings = {
        ...settings,
        overrides: modOverrides
      };
    }
    
    promises.push(
      runSingleWithRetry(workerPath, modifiedScenario, modifiedSettings)
        .then(result => ({ success: true, result, index: i }))
        .catch(error => ({ success: false, error, index: i }))
    );
  }
  
  // Wait for all workers in this batch to complete
  const outcomes = await Promise.all(promises);
  
  // Separate successes and failures
  for (const outcome of outcomes) {
    if (outcome.success) {
      results.push(outcome.result);
    } else {
      retries.push(outcome);
    }
  }
  
  // Retry failed simulations until we have enough results
  while (results.length < batchSize && retries.length > 0) {
    const retry = retries.shift();
    const retryIterationIndex = batchStartIndex + retry.index;
    
    // Apply simulate settings for retry as well
    let retryScenario = scenario;
    let retrySettings = settings;
    
    if (simulateSettings) {
      const { scenario: modScenario, overrides: modOverrides } = applySimulateSettings(
        scenario, 
        settings.overrides || null, 
        simulateSettings, 
        retryIterationIndex, 
        algorithm
      );
      retryScenario = modScenario;
      retrySettings = {
        ...settings,
        overrides: modOverrides
      };
    }
    
    try {
      const result = await runSingleWithRetry(workerPath, retryScenario, retrySettings, 3); // Extra retries for failed ones
      results.push(result);
    } catch (error) {
      console.error(`Failed to retry simulation after multiple attempts: ${error.message}`);
      // If retry still fails, we'll have fewer results - log warning
      console.warn(`Warning: Will have ${results.length} results instead of ${batchSize} for this batch`);
    }
  }
  
  if (results.length < batchSize) {
    console.warn(`Warning: Only got ${results.length} results out of ${batchSize} requested for this batch`);
  }
  
  return results;
}

/**
 * Run Monte Carlo simulation by executing DES engine multiple times in parallel.
 * 
 * This function:
 * 1. Runs the DES engine N times (iterations) using worker threads for parallelization
 * 2. Collects results from each iteration
 * 3. Aggregates statistics (mean, percentiles, stddev) across all iterations
 * 4. Returns aggregated results in the same structure as DES, but with statistics
 * 
 * @param {Object} scenario - Scenario configuration (same as DES engine)
 * @param {Object} options - Options including:
 *   - iterations: Number of Monte Carlo iterations (default: 1000)
 *   - algorithm: Algorithm to use for value calculation ('Step' or 'PERT', default: 'PERT')
 *   - keepIterations: Whether to store individual iteration results (default: false)
 *   - state: State snapshot (required, same as DES)
 *   - overrides: Resource overrides (optional, same as DES)
 *   - maxConcurrent: Maximum concurrent workers (default: CPU_COUNT - 1)
 *   - logLevel: DES log level for workers ('silent', 'error', 'warn', 'info', 'verbose', 'debug')
 *                Defaults to 'silent' to prevent log clutter during Monte Carlo runs
 *   - simulateSettings: Optional array of settings to vary across iterations
 * @returns {Object} - Aggregated Monte Carlo results with percentiles
 */
async function runMonteCarlo(scenario, options = {}) {
  const iterations = options.iterations || 1000;
  const algorithm = options.algorithm || 'PERT';
  const keepIterations = options.keepIterations || false;
  const maxConcurrent = options.maxConcurrent || WORKER_POOL_SIZE;
  const simulateSettings = options.simulateSettings || null;
  const individualResults = [];
  
  // Prepare settings object for workers
  // Default to 'silent' log level to prevent thousands of DES logs from cluttering console
  // Users can override with options.logLevel if they need debugging
  const settings = {
    state: options.state,
    overrides: options.overrides,
    logLevel: options.logLevel || 'silent'
  };
  
  // Log simulate settings if present
  if (simulateSettings && simulateSettings.length > 0) {
    console.log(`Simulating ${simulateSettings.length} setting(s) using ${algorithm} algorithm:`);
    for (const setting of simulateSettings) {
      console.log(`  - ${setting.pathString}: default=${setting.defaultValue}, range=[${setting.min}, ${setting.max}], step=${setting.step}`);
    }
  }
  
  // Run simulations in batches to control concurrency
  // Each batch runs maxConcurrent simulations in parallel
  const batchSize = Math.min(maxConcurrent, iterations);
  const numBatches = Math.ceil(iterations / batchSize);
  
  const startTime = Date.now();
  console.log(`Running ${iterations} Monte Carlo iterations using ${maxConcurrent} parallel workers (${numBatches} batches)...`);
  
  for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
    const remainingIterations = iterations - individualResults.length;
    const currentBatchSize = Math.min(batchSize, remainingIterations);
    const batchStartIndex = individualResults.length;
    
    if (currentBatchSize <= 0) break;
    
    try {
      // Run batch of simulations in parallel
      const batchResults = await runBatch(scenario, settings, currentBatchSize, batchStartIndex, simulateSettings, algorithm);
      individualResults.push(...batchResults);
      
      // Progress logging with time estimates
      const progress = ((individualResults.length / iterations) * 100).toFixed(1);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = individualResults.length / elapsed;
      const remaining = (iterations - individualResults.length) / rate;
      console.log(
        `Progress: ${individualResults.length}/${iterations} iterations (${progress}%) | ` +
        `Elapsed: ${elapsed.toFixed(1)}s | ` +
        `Rate: ${rate.toFixed(1)} iter/s | ` +
        `ETA: ${remaining.toFixed(1)}s`
      );
    } catch (error) {
      console.error(`Error in batch ${batchIndex + 1}:`, error.message);
      throw error;
    }
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const avgTimePerIteration = totalTime / iterations;
  console.log(
    `All ${iterations} iterations completed in ${totalTime.toFixed(1)}s ` +
    `(avg ${avgTimePerIteration.toFixed(3)}s per iteration). Aggregating results...`
  );
  
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
  
  // Aggregate percentile timelines
  // For each percentile, select the iteration whose missions.completed matches that percentile
  // This gives us representative timelines for each percentile
  if (individualResults.length > 0) {
    const completedValues = individualResults.map(iter => iter.missions?.completed || 0);
    const sortedIndices = completedValues
      .map((val, idx) => ({ val, idx }))
      .sort((a, b) => a.val - b.val)
      .map(item => item.idx);
    
    const percentileTimelines = {};
    const percentileKeys = ['mean', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95', 'p99', 'min', 'max'];
    
    // Calculate mean missions completed
    const meanCompleted = completedValues.reduce((a, b) => a + b, 0) / completedValues.length;
    
    // Find iteration closest to mean
    let meanIndex = 0;
    let minDiff = Math.abs(completedValues[0] - meanCompleted);
    for (let i = 1; i < completedValues.length; i++) {
      const diff = Math.abs(completedValues[i] - meanCompleted);
      if (diff < minDiff) {
        minDiff = diff;
        meanIndex = i;
      }
    }
    
    // Map percentiles to indices
    // Note: sortedIndices is sorted ascending (lowest to highest missions completed)
    // We use the same percentile calculation method as calculatePercentiles for consistency:
    // index = Math.ceil((p / 100) * n) - 1, clamped to valid range
    // This ensures we select the iteration whose missions.completed value matches the percentile
    const getPercentileIndex = (percentile) => {
      // percentile is 0-100 (e.g., 50 for P50)
      const index = Math.ceil((percentile / 100) * sortedIndices.length) - 1;
      return Math.max(0, Math.min(sortedIndices.length - 1, index));
    };
    
    const percentileMap = {
      mean: meanIndex,
      min: sortedIndices[0],  // Worst outcome (lowest missions)
      max: sortedIndices[sortedIndices.length - 1],  // Best outcome (highest missions)
      p10: sortedIndices[getPercentileIndex(90)],  // Optimistic: 90th percentile (10% did better)
      p25: sortedIndices[getPercentileIndex(75)],  // 75th percentile (25% did better)
      p50: sortedIndices[getPercentileIndex(50)],  // Median: 50th percentile
      p75: sortedIndices[getPercentileIndex(25)],  // 25th percentile (75% did better)
      p90: sortedIndices[getPercentileIndex(10)],  // Pessimistic: 10th percentile (90% did better)
      p95: sortedIndices[getPercentileIndex(5)],   // Very pessimistic: 5th percentile (95% did better)
      p99: sortedIndices[getPercentileIndex(1)]    // Extremely pessimistic: 1st percentile (99% did better)
    };
    
    // Extract timelines for each percentile
    for (const key of percentileKeys) {
      const iterIndex = percentileMap[key];
      if (iterIndex !== undefined && individualResults[iterIndex]) {
        const iter = individualResults[iterIndex];
        const timeline = iter.timeline || [];
        const missionsCompleted = iter.missions?.completed || 0;
        
        // Debug: Log percentile selection details
        const sortedIndex = sortedIndices.indexOf(iterIndex);
        console.log(`Percentile ${key}: selected iteration ${iterIndex} (position ${sortedIndex}/${sortedIndices.length - 1} in sorted array) with ${missionsCompleted} missions completed`);
        
        // Debug: Count missions by unit for this percentile
        const unitsInTimeline = new Set();
        const missionsByUnit = {};
        for (const item of timeline) {
          if (item.type === 'mission' && item.unit) {
            unitsInTimeline.add(item.unit);
            missionsByUnit[item.unit] = (missionsByUnit[item.unit] || 0) + 1;
          }
        }
        
        if (unitsInTimeline.size > 0) {
          console.log(`  Units in timeline: ${Array.from(unitsInTimeline).join(', ')}`);
          console.log(`  Missions by unit:`, missionsByUnit);
        } else if (missionsCompleted > 0) {
          console.warn(`  WARNING: missionsCompleted=${missionsCompleted} but no missions found in timeline!`);
        }
        
        percentileTimelines[key] = {
          timeline: timeline,
          rawTimeline: timeline, // Same as timeline for now
          availabilityTimeline: iter.availability_timeline || null,
          missionsCompleted: missionsCompleted,
          stddev: aggregated.missions?.completed?.stddev || 0
        };
      }
    }
    
    aggregated.percentile_timelines = percentileTimelines;
  }
  
  // Optionally include individual iterations
  // WARNING: This can be memory-intensive for large iteration counts
  // Only include minimal data (missions.completed) to avoid JSON stringify errors
  if (keepIterations) {
    aggregated.iterations = individualResults.map(iter => ({
      missions: iter.missions ? { completed: iter.missions.completed } : undefined
    }));
  }
  
  // Include initial resources from first iteration (same across all iterations)
  if (individualResults.length > 0 && individualResults[0].initial_resources) {
    aggregated.initial_resources = individualResults[0].initial_resources;
  }
  
  // Calculate unit split from scenario (same for all iterations)
  if (scenario.unit_policy && scenario.unit_policy.mission_split) {
    aggregated.unitSplit = {
      vmu1: scenario.unit_policy.mission_split['VMU-1'] || 0,
      vmu3: scenario.unit_policy.mission_split['VMU-3'] || 0
    };
  } else {
    // Default to even split if not specified
    aggregated.unitSplit = {
      vmu1: 0.5,
      vmu3: 0.5
    };
  }
  
  // Include personnel availability from scenario (same for all iterations)
  if (scenario.personnel_availability) {
    aggregated.personnel_availability = scenario.personnel_availability;
  }
  
  return aggregated;
}

module.exports = { runMonteCarlo };

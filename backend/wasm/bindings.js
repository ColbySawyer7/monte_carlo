/**
 * Node.js bindings for native Rust simulation engines (N-API)
 * 
 * This module provides a drop-in replacement interface for the original
 * JavaScript engines, using native .node binaries for maximum performance.
 * 
 * Features:
 *   - Native .node binaries (not WASM) - lightning fast execution
 *   - Full threading support with rayon for parallel Monte Carlo
 *   - No JS↔WASM conversion overhead - direct N-API calls
 * 
 * Usage:
 *   const { runSimulation, runMonteCarlo } = require('./wasm/bindings');
 *   const results = await runSimulation(scenario, { state, overrides });
 *   const monteResults = await runMonteCarlo(scenario, { state, iterations: 1000 });
 */

let desModule = null;
let monteModule = null;

/**
 * Lazy-load DES native addon (.node file)
 */
async function loadDesModule() {
  if (!desModule) {
    const path = require('path');
    const addonDir = __dirname || path.dirname(__filename);
    
    // Try to load native .node addon first (fastest - native binary)
    try {
      // Try index.js wrapper (loads index.node)
      desModule = require(path.join(addonDir, 'pkg', 'des', 'index.js'));
    } catch (error) {
      // Try loading directory (package.json main points to index.js)
      try {
        desModule = require(path.join(addonDir, 'pkg', 'des'));
      } catch (err2) {
        // Fall back to direct .node file load
        try {
          desModule = require(path.join(addonDir, 'pkg', 'des', 'index.node'));
        } catch (err3) {
          throw new Error(
            `Failed to load DES native addon. Make sure you've built it with 'npm run build-native' or './build-wasm.sh'. ` +
            `Tried: index.js, directory, and index.node. ` +
            `Last error: ${err3.message}`
          );
        }
      }
    }
    
    // Verify the module has the expected function
    if (typeof desModule.runSimulation !== 'function') {
      const availableExports = Object.keys(desModule).filter(k => typeof desModule[k] === 'function').join(', ');
      throw new Error(
        `DES native addon loaded but 'runSimulation' function not found. ` +
        `Available functions: ${availableExports || 'none'}. ` +
        `Make sure the native addon was built with napi-rs.`
      );
    }
  }
  return desModule;
}

/**
 * Lazy-load Monte Carlo native addon (.node file)
 */
async function loadMonteModule() {
  if (!monteModule) {
    const path = require('path');
    const addonDir = __dirname || path.dirname(__filename);
    
    // Try to load native .node addon first (fastest - native binary with rayon parallel processing)
    try {
      // Try index.js wrapper (loads index.node)
      monteModule = require(path.join(addonDir, 'pkg', 'monte', 'index.js'));
    } catch (error) {
      // Try loading directory (package.json main points to index.js)
      try {
        monteModule = require(path.join(addonDir, 'pkg', 'monte'));
      } catch (err2) {
        // Fall back to direct .node file load
        try {
          monteModule = require(path.join(addonDir, 'pkg', 'monte', 'index.node'));
        } catch (err3) {
          throw new Error(
            `Failed to load Monte Carlo native addon. Make sure you've built it with 'npm run build-native' or './build-wasm.sh'. ` +
            `Tried: index.js, directory, and index.node. ` +
            `Last error: ${err3.message}`
          );
        }
      }
    }
    
    // Verify the module has the expected function
    if (typeof monteModule.runMonteCarlo !== 'function') {
      const availableExports = Object.keys(monteModule).filter(k => typeof monteModule[k] === 'function').join(', ');
      throw new Error(
        `Monte Carlo native addon loaded but 'runMonteCarlo' function not found. ` +
        `Available functions: ${availableExports || 'none'}. ` +
        `Make sure the native addon was built with napi-rs.`
      );
    }
  }
  return monteModule;
}

/**
 * Run DES simulation (Native N-API version)
 * 
 * This function provides a drop-in replacement for the JavaScript DES engine.
 * It uses native Rust code via N-API for maximum performance.
 * 
 * @param {Object} scenario - Scenario configuration with:
 *   - horizon_hours: number
 *   - demand: Array of demand specifications
 *   - mission_types: Array of mission type definitions
 *   - process_times: Object with preflight, postflight, turnaround, mount_times
 *   - unit_policy: Optional unit assignment policy
 * @param {Object} options - Options object with:
 *   - state: State snapshot with tables (v_aircraft, v_payload, v_staffing, v_unit)
 *   - overrides: Optional resource overrides per unit
 * @returns {Promise<Object>} - Simulation results matching the JS engine format
 */
async function runSimulation(scenario, options = {}) {
  const module = await loadDesModule();
  
  // Validate inputs
  if (!scenario || typeof scenario !== 'object') {
    throw new Error('Scenario must be a valid object');
  }
  
  if (!options.state || typeof options.state !== 'object') {
    throw new Error('Options must include a valid state object');
  }
  
  try {
    // N-API functions accept serde_json::Value which is automatically converted from JS objects
    // The function is synchronous in Rust, so it executes immediately
    // No JS↔WASM conversion overhead - direct native call
    const results = module.runSimulation(scenario, options);
    
    // The result is already a JavaScript object (deserialized from JSON)
    // Structure matches the JS engine: { horizon_hours, missions, rejections, utilization, by_type, timeline, initial_resources }
    return results;
  } catch (error) {
    // Preserve original error message for compatibility with routes_sim.js
    // The error.message will contain the detailed error from Rust
    const errorMessage = error.message || String(error);
    // Re-throw with the original message to maintain compatibility
    // routes_sim.js expects error.message to contain the actual error
    const err = new Error(errorMessage);
    err.stack = error.stack; // Preserve stack trace if available
    throw err;
  }
}

/**
 * Run Monte Carlo simulation (Native N-API version)
 * 
 * This function provides a drop-in replacement for the JavaScript Monte Carlo engine.
 * It runs multiple DES simulations in parallel using rayon and aggregates the results with statistics.
 * 
 * @param {Object} scenario - Scenario configuration (same as DES) with:
 *   - horizon_hours: number
 *   - demand: Array of demand specifications
 *   - mission_types: Array of mission type definitions
 *   - process_times: Object with preflight, postflight, turnaround, mount_times
 *   - unit_policy: Optional unit assignment policy
 * @param {Object} options - Options object with:
 *   - iterations: Number of Monte Carlo iterations (default: 1000)
 *   - keepIterations: Whether to store individual iteration results (default: false)
 *   - state: State snapshot with tables (v_aircraft, v_payload, v_staffing, v_unit) - REQUIRED
 *   - overrides: Optional resource overrides per unit
 * @returns {Promise<Object>} - Aggregated Monte Carlo results with statistics:
 *   - iterations: number of iterations run
 *   - horizon_hours: simulation horizon
 *   - missions: Object with aggregated statistics (mean, percentiles, stddev, min, max) for requested, started, completed, rejected
 *   - rejections: Object with aggregated statistics for aircraft, pilot, so, payload
 *   - utilization: Nested object per unit and resource type with aggregated statistics
 *   - by_type: Nested object per mission type with aggregated statistics
 *   - initial_resources: Initial resource configuration (same as DES)
 */
async function runMonteCarlo(scenario, options = {}) {
  const module = await loadMonteModule();
  
  // Validate inputs
  if (!scenario || typeof scenario !== 'object') {
    throw new Error('Scenario must be a valid object');
  }
  
  if (!options.state || typeof options.state !== 'object') {
    throw new Error('Options must include a valid state object');
  }
  
  // Prepare options with defaults matching JavaScript engine behavior
  // The Rust struct uses #[serde(rename = "keepIterations")] to map camelCase to snake_case
  // All other fields match between JS and Rust (iterations, state, overrides)
  const nativeOptions = {
    iterations: options.iterations || 1000,
    keepIterations: options.keepIterations || false,
    state: options.state,
    overrides: options.overrides || null,
  };
  
  try {
    // N-API functions accept serde_json::Value which is automatically converted from JS objects
    // The function uses rayon for parallel processing - all CPU cores are utilized
    // No JS↔WASM conversion overhead - direct native call with full threading support
    // The function is synchronous in Rust, so it executes immediately
    const results = module.runMonteCarlo(scenario, nativeOptions);
    
    // The result is already a JavaScript object (deserialized from JSON)
    // Structure matches the JS engine format with aggregated statistics
    return results;
  } catch (error) {
    // Preserve original error message for compatibility with routes_sim.js
    // The error.message will contain the detailed error from Rust
    const errorMessage = error.message || String(error);
    // Re-throw with the original message to maintain compatibility
    // routes_sim.js expects error.message to contain the actual error
    const err = new Error(errorMessage);
    err.stack = error.stack; // Preserve stack trace if available
    throw err;
  }
}

module.exports = {
  runSimulation,
  runMonteCarlo,
};


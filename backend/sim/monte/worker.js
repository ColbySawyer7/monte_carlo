/**
 * Monte Carlo Worker Thread
 * 
 * This worker runs a single DES simulation in isolation.
 * Each worker thread has its own V8 instance, so they can run in parallel.
 * 
 * IMPORTANT: Set log level BEFORE requiring any modules that use logging,
 * since each worker thread has its own copy of the utils module.
 */

const { parentPort, workerData } = require('worker_threads');

// Set log level IMMEDIATELY after getting workerData, before requiring any other modules
// This ensures the log level is set before any DES engine modules are loaded
// Each worker thread has its own copy of the utils module, so we must set it here
const { setLogLevel, getLogLevel } = require('../../utils');

// Extract log level from worker data (defaults to 'silent' for Monte Carlo to prevent log clutter)
// The Monte Carlo engine passes logLevel in settings, defaulting to 'silent'
const logLevel = (workerData && workerData.settings && workerData.settings.logLevel) 
  ? workerData.settings.logLevel 
  : 'silent';

// Set log level immediately - this must happen before requiring DES engine
setLogLevel(logLevel);

// Verify it was set correctly (for debugging - can remove later)
if (getLogLevel() !== logLevel) {
  console.error(`Warning: Failed to set log level to '${logLevel}', current level is '${getLogLevel()}'`);
}

// Now require DES engine (it will use the log level we just set)
const { runSimulation } = require('../des/engine');

/**
 * Run a single DES simulation
 */
async function runSingleSimulation() {
  try {
    const { scenario, settings } = workerData;
    
    if (!scenario) {
      throw new Error('Scenario is required');
    }
    
    // Run simulation (log level already set above to 'silent' by default)
    const result = await runSimulation(scenario, settings);
    
    // Send result back to main thread
    parentPort.postMessage({ success: true, result });
  } catch (error) {
    // Send error back to main thread
    parentPort.postMessage({ 
      success: false, 
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    });
  }
}

// Run the simulation when worker receives data
runSingleSimulation();


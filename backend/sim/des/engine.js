// DES (Discrete Event Simulation) Engine
// Main simulation orchestrator that coordinates all stage modules

// Stage modules
const { processScenario } = require('./stages/stage1-scenario');
const { applySettings } = require('./stages/stage2-settings');
const { processPersonnel } = require('./stages/stage3-personnel');
const { processOperations } = require('./stages/stage4-operations');
const { runSimulation: runSimulationStage } = require('./stages/stage5-simulation');
const { generateResults } = require('./stages/stage6-results');

// Utility for log level management
const { setLogLevel, getLogLevel } = require('../../utils');

/**
 * Run a discrete event simulation for squadron operations
 * 
 * @param {Object} scenario - Scenario configuration with mission types, demand, process times, etc.
 * @param {Object} settings - Simulation settings
 * @param {Object} settings.state - State snapshot with resource data
 * @param {Object} settings.overrides - Optional resource overrides by unit
 * @param {string} settings.logLevel - Optional log level ('silent', 'error', 'warn', 'info', 'verbose', 'debug'). Defaults to 'verbose'
 * @returns {Promise<Object>} Simulation results with missions, rejections, utilization, timeline
 */
async function runSimulation(scenario, settings = {}) {
  // Set log level if provided (save current level to restore later)
  // This allows callers to control logging verbosity
  const previousLogLevel = getLogLevel();
  if (settings.logLevel !== undefined && settings.logLevel !== null) {
    setLogLevel(settings.logLevel);
  }

  try {
    // Stage 1: Process scenario configuration
    const config = processScenario(scenario);

    // Stage 2: Apply settings (load state and overrides)
    const initial = applySettings(settings, scenario);

    // Stage 3: Process personnel configuration
    const personnel = processPersonnel(scenario, initial);

    // Stage 4: Process operations (demand generation and resource pools)
    const operations = processOperations(scenario, initial, personnel);

    // Stage 5: Run simulation (process all events)
    const context = {
      events: operations.events,
      pools: operations.pools,
      unitList: operations.unitList,
      horizon: config.horizon,
      missionTypes: config.missionTypes,
      preSpec: config.preSpec,
      postSpec: config.postSpec,
      turnSpec: config.turnSpec,
      scenario,
      initial,
      overrides: settings.overrides && settings.overrides.units ? settings.overrides.units : null
    };
    const partialResults = runSimulationStage(context);

    // Stage 6: Generate final results
    const resultsContext = {
      pools: operations.pools,
      horizon: config.horizon,
      initial,
      availability: personnel,
      scenario
    };
    return generateResults(partialResults, resultsContext);

  } finally {
    // Restore previous log level
    if (settings.logLevel) {
      setLogLevel(previousLogLevel);
    }
  }
}

module.exports = { runSimulation };

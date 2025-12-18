// Stage 1: Scenario
// Extract scenario parameters and build mission lookup map

const { logWithLocation } = require('../../../utils');
const { buildMissionMap } = require('../helpers/demand');

/**
 * Process scenario configuration and extract simulation parameters
 * 
 * @param {Object} scenario - Scenario configuration
 * @returns {Object} Configuration context with horizon, missionTypes, process times
 */
function processScenario(scenario) {
  logWithLocation(`******************`);
  logWithLocation(` Simulation Start `);
  logWithLocation(`******************\n`);

  const horizon = scenario.horizon_hours || 24;
  const missionTypes = buildMissionMap(scenario);
  const preSpec = scenario.process_times?.preflight;
  const postSpec = scenario.process_times?.postflight;
  const turnSpec = scenario.process_times?.turnaround;

  return {
    horizon,
    missionTypes,
    preSpec,
    postSpec,
    turnSpec
  };
}

module.exports = { processScenario };

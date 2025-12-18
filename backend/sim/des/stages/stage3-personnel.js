// Stage 3: Personnel
// Calculate personnel availability factors and configure work schedules

const { logPersonnelAvailability } = require('../../../utils');
const { calculateAvailabilityFactor } = require('../helpers/availability');

/**
 * Process personnel configuration: availability factors and work schedules
 * 
 * @param {Object} scenario - Scenario configuration with personnel_availability
 * @param {Object} initial - Initial state with unit staffing data
 * @returns {Object} Personnel configuration with factors and work schedules
 */
function processPersonnel(scenario, initial) {
  const personnelAvailability = scenario.personnel_availability || {};

  const pilotConfig = personnelAvailability['7318'] || {};
  const soConfig = personnelAvailability['7314'] || {};
  const intelConfig = personnelAvailability['0231'] || {};

  const pilotAvailability = calculateAvailabilityFactor(pilotConfig);
  const soAvailability = calculateAvailabilityFactor(soConfig);
  const intelAvailability = calculateAvailabilityFactor(intelConfig);

  // Extract crew rest hours from personnel availability configuration
  const pilotCrewRestHours = pilotConfig.daily_crew_rest_hours || 0;
  const soCrewRestHours = soConfig.daily_crew_rest_hours || 0;
  const intelCrewRestHours = intelConfig.daily_crew_rest_hours || 0;

  // Extract work schedules for pilots, SOs, and intel, including crew rest hours
  const pilotWorkSchedule = {
    ...(pilotConfig.work_schedule), daily_crew_rest_hours: pilotCrewRestHours
  };
  const soWorkSchedule = {
    ...(soConfig.work_schedule), daily_crew_rest_hours: soCrewRestHours
  };
  const intelWorkSchedule = {
    ...(intelConfig.work_schedule), daily_crew_rest_hours: intelCrewRestHours
  };

  // Calculate total and effective personnel across all units for logging
  let totalPilots = 0;
  let totalSOs = 0;
  let totalIntel = 0;
  const unitBreakdown = {};

  for (const unit of initial.units) {
    const crew = initial.staffingByUnit[unit] || { pilot: 0, so: 0, intel: 0 };
    const pilotCount = crew.pilot || 0;
    const soCount = crew.so || 0;
    const intelCount = crew.intel || 0;

    totalPilots += pilotCount;
    totalSOs += soCount;
    totalIntel += intelCount;

    // Store per-unit counts
    unitBreakdown[unit] = {
      pilot: {
        total: pilotCount,
        effective: Math.floor(pilotCount * pilotAvailability)
      },
      so: {
        total: soCount,
        effective: Math.floor(soCount * soAvailability)
      },
      intel: {
        total: intelCount,
        effective: Math.floor(intelCount * intelAvailability)
      }
    };
  }
  const effectivePilotsTotal = Math.floor(totalPilots * pilotAvailability);
  const effectiveSOsTotal = Math.floor(totalSOs * soAvailability);
  const effectiveIntelTotal = Math.floor(totalIntel * intelAvailability);

  const staffingData = {
    pilot: { total: totalPilots, effective: effectivePilotsTotal },
    so: { total: totalSOs, effective: effectiveSOsTotal },
    intel: { total: totalIntel, effective: effectiveIntelTotal },
    units: unitBreakdown
  };

  // Log personnel availability configuration
  logPersonnelAvailability(personnelAvailability, staffingData);

  return {
    pilotAvailability,
    soAvailability,
    intelAvailability,
    pilotCrewRestHours,
    soCrewRestHours,
    intelCrewRestHours,
    pilotWorkSchedule,
    soWorkSchedule,
    intelWorkSchedule,
    personnelAvailability
  };
}

module.exports = { processPersonnel };

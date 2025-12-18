// Stage 6: Results
// Calculate completion counts, utilization metrics, and availability timeline

const { logWithLocation } = require('../../../utils');
const { generateAvailabilityTimeline } = require('../helpers/availability');

/**
 * Generate final results with completion counts and metrics
 * 
 * @param {Object} results - Partial results from stage 5
 * @param {Object} context - Context with pools, horizon, initial state, etc.
 * @returns {Object} Complete results with utilization and availability timeline
 */
function generateResults(results, context) {
  const { pools, horizon, initial, availability, scenario } = context;
  const unitList = Object.keys(pools);

  // Count completed missions
  for (const unit of unitList) {
    const pool = pools[unit];
    const completed = pool.missionFinishes.filter(t => t <= horizon).length;
    results.missions.completed += completed;
  }

  // Track per-mission-type completion counts
  for (const item of results.timeline) {
    if (item.type === 'mission' && item.finish_time <= horizon) {
      const btC = results.by_type[item.mission_type] || { requested: 0, started: 0, completed: 0, rejected: 0 };
      btC.completed = (btC.completed || 0) + 1;
      results.by_type[item.mission_type] = btC;
    }
  }

  // Calculate utilization metrics per unit
  for (const unit of unitList) {
    const pool = pools[unit];

    const aircraftStats = pool.aircraft.getStats(horizon);

    const pilotRawTotal = pool.initial_crew?.pilot || pool.pilot.total;
    const pilotEffectiveTotal = pool.pilot.total;
    const pilotStats = pool.pilot.getStats(horizon, pilotEffectiveTotal, pilotRawTotal);

    const soRawTotal = pool.initial_crew?.so || pool.so.total;
    const soEffectiveTotal = pool.so.total;
    const soStats = pool.so.getStats(horizon, soEffectiveTotal, soRawTotal);

    const intelRawTotal = pool.initial_crew?.intel || pool.intel.total;
    const intelEffectiveTotal = pool.intel.total;
    const intelStats = pool.intel.getStats(horizon, intelEffectiveTotal, intelRawTotal);

    results.utilization[unit] = {
      aircraft: Number(pool.aircraft.utilization().toFixed(3)),
      aircraft_efficiency: Number(pool.aircraft.efficiency(horizon).toFixed(3)),
      aircraft_stats: aircraftStats,
      pilot: Number(pool.pilot.utilization().toFixed(3)),
      pilot_efficiency: Number(pool.pilot.efficiency(horizon).toFixed(3)),
      pilot_stats: pilotStats,
      so: Number(pool.so.utilization().toFixed(3)),
      so_efficiency: Number(pool.so.efficiency(horizon).toFixed(3)),
      so_stats: soStats,
      intel: Number(pool.intel.utilization().toFixed(3)),
      intel_efficiency: Number(pool.intel.efficiency(horizon).toFixed(3)),
      intel_stats: intelStats,
      availability_factors: pool.availability_factors,
      initial_crew: pool.initial_crew,
      effective_crew: {
        pilot: pool.pilot.total,
        so: pool.so.total,
        intel: pool.intel.total
      }
    };
  }

  // Generate availability timeline
  const personnelAvailability = availability.personnelAvailability;
  if (personnelAvailability['7318'] || personnelAvailability['7314'] || personnelAvailability['0231']) {
    results.availability_timeline = {
      pilot: null,
      so: null,
      intel: null
    };

    results.availability_timeline.pilot = {};
    results.availability_timeline.so = {};
    results.availability_timeline.intel = {};

    for (const unit of initial.units) {
      const crew = initial.staffingByUnit[unit] || { pilot: 0, so: 0, intel: 0 };

      if (personnelAvailability['7318'] && crew.pilot > 0) {
        results.availability_timeline.pilot[unit] = generateAvailabilityTimeline(
          personnelAvailability['7318'],
          crew.pilot,
          horizon,
          scenario.duty_requirements,
          '7318'
        );
      }

      if (personnelAvailability['7314'] && crew.so > 0) {
        results.availability_timeline.so[unit] = generateAvailabilityTimeline(
          personnelAvailability['7314'],
          crew.so,
          horizon,
          scenario.duty_requirements,
          '7314'
        );
      }

      if (personnelAvailability['0231'] && crew.intel > 0) {
        results.availability_timeline.intel[unit] = generateAvailabilityTimeline(
          personnelAvailability['0231'],
          crew.intel,
          horizon,
          scenario.duty_requirements,
          '0231'
        );
      }
    }
  }

  logWithLocation(``);
  logWithLocation(`=====================`);
  logWithLocation(` Simulation Complete `);
  logWithLocation(`=====================\n`);

  return results;
}

module.exports = { generateResults };

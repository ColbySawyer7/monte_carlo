// Stage 4: Operations
// Generate demand events, initialize resource pools, and setup unit selection
// Combines mission types and demand generation (operations logic)

const { logWithLocation } = require('../../../utils');
const { generateDemand } = require('../helpers/demand');
const { EquipmentPool, CrewQueue } = require('../helpers/resources');

/**
 * Process operations: generate demand and initialize resource pools
 * 
 * @param {Object} scenario - Scenario configuration
 * @param {Object} initial - Initial state with resource counts
 * @param {Object} personnel - Personnel configuration from stage 3
 * @returns {Object} Events, pools, and unit selection data
 */
function processOperations(scenario, initial, personnel) {
  const {
    pilotAvailability,
    soAvailability,
    intelAvailability,
    pilotCrewRestHours,
    soCrewRestHours,
    intelCrewRestHours,
    pilotWorkSchedule,
    soWorkSchedule,
    intelWorkSchedule
  } = personnel;

  // Generate demand events first
  const events = generateDemand(scenario);

  const pools = {};

  // Initialize resource pools for each unit
  for (const unit of initial.units) {
    const acTotal = initial.aircraftByUnit[unit] || 0;
    const crew = initial.staffingByUnit[unit] || { pilot: 0, so: 0, intel: 0 };

    // Full crew for ALL assignments (duty and flight)
    const fullPilots = crew.pilot || 0;
    const fullSOs = crew.so || 0;
    const fullIntel = crew.intel || 0;

    // Apply availability factors to get effective crew sizes
    // Only the effective crew can be used in simulation
    const effectivePilots = Math.floor(fullPilots * pilotAvailability);
    const effectiveSOs = Math.floor(fullSOs * soAvailability);
    const effectiveIntel = Math.floor(fullIntel * intelAvailability);

    pools[unit] = {
      aircraft: new EquipmentPool(`aircraft:${unit}`, acTotal),
      // Use effective crew sizes (reduced by availability factors) and pass work schedules
      // Pass 0 for crew rest hours since rest is now handled by work schedule
      pilot: new CrewQueue(`pilot:${unit}`, effectivePilots, 0, pilotWorkSchedule),
      so: new CrewQueue(`so:${unit}`, effectiveSOs, 0, soWorkSchedule),
      intel: new CrewQueue(`intel:${unit}`, effectiveIntel, 0, intelWorkSchedule),
      payloads: {},
      missionFinishes: [],
      availability_factors: {
        pilot: pilotAvailability,
        so: soAvailability,
        intel: intelAvailability
      },
      initial_crew: {
        pilot: fullPilots,
        so: fullSOs,
        intel: fullIntel
      },
      effective_crew: {
        pilot: effectivePilots,
        so: effectiveSOs,
        intel: effectiveIntel
      }
    };
    const payloads = initial.payloadByUnit[unit] || {};
    for (const [ptype, count] of Object.entries(payloads)) {
      pools[unit].payloads[ptype] = new EquipmentPool(`payload:${unit}:${ptype}`, count || 0);
    }
  }

  // Calculate duty rotation pool sizes
  const dutyCycleDays = 30;
  const dutyCycleHours = dutyCycleDays * 24; // 720 hours

  // Count duty demands per type in the first duty cycle
  const dutyDemandsInCycle = {};
  for (const ev of events) {
    if (ev.type !== 'duty_demand' || ev.time >= dutyCycleHours) continue;
    const dutyType = ev.duty_type || 'unknown';
    if (!dutyDemandsInCycle[dutyType]) {
      dutyDemandsInCycle[dutyType] = { pilot: 0, so: 0, count: 0 };
    }
    dutyDemandsInCycle[dutyType].pilot += ev.requires_pilot || 0;
    dutyDemandsInCycle[dutyType].so += ev.requires_so || 0;
    dutyDemandsInCycle[dutyType].count += 1;
  }

  // Calculate rotation pool sizes for each unit
  for (const unit of initial.units) {
    const pool = pools[unit];
    let pilotDutySlots = 0;
    let soDutySlots = 0;

    // Sum up rotating duty requirements (exclude ODO which is continuous)
    for (const [dutyType, demands] of Object.entries(dutyDemandsInCycle)) {
      const isContinuous = dutyType.toLowerCase() === 'odo';
      if (!isContinuous) {
        pilotDutySlots += demands.pilot;
        soDutySlots += demands.so;
      }
    }

    // Each crew member can do duty once per cycle, so we need this many in rotation
    // Add 20% buffer for scheduling flexibility
    const pilotPoolSize = Math.ceil(pilotDutySlots * 1.2);
    const soPoolSize = Math.ceil(soDutySlots * 1.2);

    // Don't exceed total crew size
    const effectivePilotPoolSize = Math.min(pilotPoolSize, pool.pilot.total);
    const effectiveSOPoolSize = Math.min(soPoolSize, pool.so.total);

    pool.pilot.setDutyRotationPoolSize(effectivePilotPoolSize);
    pool.so.setDutyRotationPoolSize(effectiveSOPoolSize);
  }

  // Build unit selection policy
  const split = scenario.unit_policy?.mission_split || {};
  const unitList = Object.keys(pools);

  // Count total mission demands to build accurate distribution sequence
  const missionDemandCount = events.filter(e => e.type === 'mission_demand').length;

  // Build deterministic round-robin sequence based on split ratios and actual demand count
  let unitSequence = [];
  if (Object.keys(split).length > 0 && missionDemandCount > 0) {
    // Normalize split ratios to percentages
    const totalSplit = Object.values(split).reduce((sum, val) => sum + val, 0);
    const normalized = {};
    for (const [unit, ratio] of Object.entries(split)) {
      normalized[unit] = ratio / totalSplit;
    }

    // Calculate exact number of missions per unit based on actual demand count
    const unitCounts = {};
    let allocated = 0;
    const units = Object.keys(normalized);

    // Allocate missions proportionally
    for (let i = 0; i < units.length - 1; i++) {
      const unit = units[i];
      const count = Math.round(normalized[unit] * missionDemandCount);
      unitCounts[unit] = count;
      allocated += count;
    }
    // Last unit gets remainder to ensure exact total
    unitCounts[units[units.length - 1]] = missionDemandCount - allocated;

    // Create interleaved sequence for even distribution
    unitSequence = new Array(missionDemandCount);
    const counters = {};
    units.forEach(u => counters[u] = 0);

    for (let i = 0; i < missionDemandCount; i++) {
      // Pick unit with highest remaining ratio
      let bestUnit = null;
      let bestScore = -1;
      for (const unit of units) {
        const remaining = unitCounts[unit] - counters[unit];
        const slotsLeft = missionDemandCount - i;
        const score = remaining / slotsLeft;
        if (score > bestScore) {
          bestScore = score;
          bestUnit = unit;
        }
      }
      if (bestUnit) {
        unitSequence[i] = bestUnit;
        counters[bestUnit]++;
      }
    }

    logWithLocation(`Mission split sequence (${missionDemandCount} missions):`);
    for (const [unit, count] of Object.entries(unitCounts)) {
      const pct = (count / missionDemandCount * 100).toFixed(1);
      logWithLocation(`  ${unit}: ${count} missions (${pct}%)`);
    }
  }

  function pickUnit(idx) {
    if (!unitList.length) return null;
    if (unitSequence.length === 0) {
      // No split defined, use simple round-robin
      return unitList[idx % unitList.length];
    }
    // Use sequence with wrapping (shouldn't wrap if sequence matches demand count)
    return unitSequence[idx % unitSequence.length];
  }

  // Pre-assign units to mission demands for ODO duty planning
  let missionIdx = 0;
  for (const ev of events) {
    if (ev.type === 'mission_demand') {
      ev.assignedUnit = pickUnit(missionIdx);
      missionIdx++;
    }
  }

  return {
    events,
    pools,
    unitList,
    pickUnit
  };
}

module.exports = { processOperations };

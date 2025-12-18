// Demand Generation Module
// Creates mission and duty demand events

const { sampleDist } = require('./distributions');

/**
 * Build a Map of mission types indexed by name for fast lookup
 * @param {Object} scenario - Scenario configuration
 * @param {Array} scenario.mission_types - Array of mission type definitions
 * @returns {Map<string, Object>} Map of mission type name to mission type object
 */
function buildMissionMap(scenario) {
  const map = new Map();
  for (const mt of scenario.mission_types) {
    map.set(mt.name, mt);
  }
  return map;
}

/**
 * Generate mission and duty demand events over the simulation horizon
 * Supports deterministic (fixed interval) and Poisson (random) demand patterns
 * @param {Object} scenario - Scenario configuration
 * @param {number} scenario.horizon_hours - Simulation duration in hours
 * @param {Array} scenario.demand - Mission demand specifications
 * @param {Array} scenario.mission_types - Mission type definitions with crew requirements
 * @param {Object} scenario.duty_requirements - Duty shift requirements (ODO, SDO, etc.)
 * @returns {Array<Object>} Sorted array of demand events with time and type
 */
function generateDemand(scenario) {
  const horizon = scenario.horizon_hours;
  const events = [];
  const demandList = scenario.demand || [];

  // Build mission type lookup for crew requirements
  const missionTypeMap = buildMissionMap(scenario);

  // Generate mission demand events
  for (const d of demandList) {
    const typ = d.type || 'poisson';
    const missionType = missionTypeMap.get(d.mission_type);
    const requiredAircrew = missionType?.required_aircrew || {};
    const requiresPilot = requiredAircrew.pilot || 0;
    const requiresSO = requiredAircrew.so || 0;
    const requiresIntel = requiredAircrew.intel || 0;

    // Deterministic demand: fixed intervals
    if (typ === 'deterministic') {
      const every = d.every_hours || d.interval_hours || 1;
      if (every <= 0) continue;
      let t = (d.start_at_hours != null) ? d.start_at_hours : 0;
      while (t < horizon) {
        events.push({
          time: t,
          type: 'mission_demand',
          mission_type: d.mission_type,
          requires_pilot: requiresPilot,
          requires_so: requiresSO,
          requires_intel: requiresIntel
        });
        t += every;
      }
      // Poisson demand: random intervals based on exponential distribution
    } else {
      const rate = d.rate_per_hour || 0;
      if (rate <= 0) continue;
      let t = 0;
      while (t < horizon) {
        const dt = sampleDist({ type: 'exponential', rate_per_hour: rate });
        t += dt; // Advance to next demand time
        if (t <= horizon) {
          events.push({
            time: t,
            type: 'mission_demand',
            mission_type: d.mission_type,
            requires_pilot: requiresPilot,
            requires_so: requiresSO
          });
        }
      }
    }
  }

  // Generate duty shift demand events
  const dutyReqs = scenario.duty_requirements || {};

  // For ODO duties, we need to know mission timings first to only schedule during active missions
  let missionPeriods = [];
  const hasODO = Object.keys(dutyReqs).some(dt => dt.toLowerCase() === 'odo' && dutyReqs[dt]?.enabled);

  if (hasODO) {
    // Calculate mission periods (preflight start to postflight end) for ODO scheduling
    const preSpec = scenario.process_times?.preflight;
    const postSpec = scenario.process_times?.postflight;

    for (const missionEvent of events.filter(e => e.type === 'mission_demand')) {
      const mt = missionTypeMap.get(missionEvent.mission_type);
      if (!mt) continue;

      // Calculate mission timing
      let mountTime = 0;
      for (const ptype of mt.required_payload_types || []) {
        const spec = scenario.process_times?.mount_times?.[ptype];
        const avgMount = spec?.mean || spec?.min || 0;
        mountTime += avgMount;
      }

      const preAvg = preSpec?.mean || preSpec?.min || 0;
      const transitIn = mt.flight_time?.transit_in_hours || 0;
      const flightAvg = mt.flight_time?.mean || mt.flight_time?.min || 0;
      const transitOut = mt.flight_time?.transit_out_hours || 0;
      const postAvg = postSpec?.mean || postSpec?.min || 0;

      // ODO needed from preflight start to postflight end
      const missionStart = missionEvent.time;
      const preflightEnd = missionStart + preAvg;
      const postflightStart = missionStart + preAvg + mountTime + transitIn + flightAvg + transitOut;
      const postflightEnd = postflightStart + postAvg;

      missionPeriods.push({
        start: missionStart,
        end: postflightEnd
      });
    }

    // Merge overlapping mission periods
    missionPeriods.sort((a, b) => a.start - b.start);
    const mergedPeriods = [];
    for (const period of missionPeriods) {
      if (mergedPeriods.length === 0 || mergedPeriods[mergedPeriods.length - 1].end < period.start) {
        mergedPeriods.push({ ...period });
      } else {
        // Extend the last period if overlapping
        mergedPeriods[mergedPeriods.length - 1].end = Math.max(
          mergedPeriods[mergedPeriods.length - 1].end,
          period.end
        );
      }
    }
    missionPeriods = mergedPeriods;
  }

  for (const [dutyType, config] of Object.entries(dutyReqs)) {
    if (!config || !config.enabled) continue;
    const shiftsPerDay = config.shifts_per_day || 0;
    const hoursPerShift = config.hours_per_shift || 8;
    const startHour = config.start_hour || 0; // Hour of day (0-23) when first shift starts
    if (shiftsPerDay <= 0 || hoursPerShift <= 0) continue;
    const shiftInterval = 24 / shiftsPerDay; // hours between shift starts

    const isODO = dutyType.toLowerCase() === 'odo';

    // Start at the configured start hour (e.g., if start_hour=8, first shift is at t=8)
    let t = startHour;
    while (t < horizon) {
      // For ODO, only create duty demand if there's an active mission during this shift
      if (isODO) {
        const shiftEnd = t + hoursPerShift;
        const hasActiveMission = missionPeriods.some(period => {
          // Shift overlaps with mission if shift starts before mission ends and shift ends after mission starts
          return t < period.end && shiftEnd > period.start;
        });

        if (!hasActiveMission) {
          t += shiftInterval;
          continue; // Skip this ODO shift - no mission activity
        }
      }

      events.push({
        time: t,
        type: 'duty_demand',
        duty_type: dutyType,
        duration: hoursPerShift,
        requires_pilot: config.requires_pilot || 0,
        requires_so: config.requires_so || 0,
        requires_intel: config.requires_intel || 0,
        duty_recovery_hours: config.duty_recovery_hours || 0,
        respect_work_schedule: config.respect_work_schedule ?? false
      });
      t += shiftInterval;
    }
  }

  // Sort events by time first, with duty demands prioritized over missions at the same time
  events.sort((a, b) => {
    // Sort by time first
    if (a.time !== b.time) return a.time - b.time;
    // At same time: duty_demand comes before mission_demand
    if (a.type === 'duty_demand' && b.type !== 'duty_demand') return -1;
    if (a.type !== 'duty_demand' && b.type === 'duty_demand') return 1;
    return 0;
  });

  return events;
}

module.exports = { buildMissionMap, generateDemand };

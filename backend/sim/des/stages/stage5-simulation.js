// Stage 5: Simulation
// Run the core simulation by processing duty and mission demands

const { logWithLocation } = require('../../../utils');
const { processMissionDemand } = require('./stage5a-mission-processing');
const { processDutyDemand } = require('./stage5b-duty-processing');

/**
 * Run simulation by processing all demand events (duty and mission)
 * 
 * @param {Object} context - Context with events, pools, scenario, etc.
 * @returns {Object} Results with missions, rejections, timeline
 */
function runSimulation(context) {
  const {
    events,
    pools,
    unitList,
    horizon,
    missionTypes,
    preSpec,
    postSpec,
    turnSpec,
    scenario,
    initial,
    overrides
  } = context;

  // Initialize results tracking
  const results = {
    horizon_hours: horizon,
    missions: { requested: 0, started: 0, completed: 0, rejected: 0 },
    rejections: { aircraft: 0, pilot: 0, so: 0, intel: 0, payload: 0 },
    duties: { requested: 0, filled: 0, unfilled: 0 },
    utilization: {},
    by_type: {},
    timeline: [],
    initial_resources: {
      units: initial.units.slice(),
      aircraftByUnit: initial.aircraftByUnit,
      staffingByUnit: initial.staffingByUnit,
      payloadByUnit: initial.payloadByUnit,
      overrides_applied: Boolean(overrides)
    }
  };

  // Duty lookahead helper
  function getUpcomingDutyRequirements(unit, fromTime, lookaheadHours) {
    logWithLocation(`********** Duty Lookahead Enabled **********`)
    logWithLocation(`Checking upcoming duty requirements for ${unit} from t=${fromTime}h over next ${lookaheadHours}h...`);
    let pilotsNeeded = 0;
    let sosNeeded = 0;
    let intelNeeded = 0;
    const dutyPeriods = [];

    // Count upcoming duty shifts and which MOSs can fill them
    // Since each shift needs 1 person from any eligible MOS, we conservatively
    // reserve crew from all eligible MOS pools
    // NOTE: ODO is excluded because it's only assigned when missions are accepted
    for (const ev of events) {
      if (ev.type !== 'duty_demand') continue;
      if (ev.time <= fromTime) continue;
      if (ev.time > fromTime + lookaheadHours) break;

      // Skip ODO in lookahead - ODO is only assigned when missions are accepted
      const isODO = ev.duty_type && ev.duty_type.toLowerCase() === 'odo';
      if (isODO) continue;

      const canUsePilot = (ev.requires_pilot || 0) === 1;
      const canUseSO = (ev.requires_so || 0) === 1;
      const canUseIntel = (ev.requires_intel || 0) === 1;

      // Reserve 1 from each eligible MOS pool (conservative approach)
      if (canUsePilot) pilotsNeeded += 1;
      if (canUseSO) sosNeeded += 1;
      if (canUseIntel) intelNeeded += 1;

      // Track this duty period
      dutyPeriods.push({
        type: ev.duty_type || 'duty',
        start: ev.time,
        end: ev.time + ev.duration,
        duration: ev.duration,
        pilot: canUsePilot,
        so: canUseSO,
        intel: canUseIntel
      });
    }

    logWithLocation(`${unit}: Upcoming duty requirements from t=${fromTime}h over ${lookaheadHours}h: Pilots=${pilotsNeeded}, SOs=${sosNeeded}, Intel=${intelNeeded}`);

    // Log each duty period
    if (dutyPeriods.length > 0) {
      logWithLocation(`${unit}: Duty periods reserving crew (excluding ODO):`);
      for (const period of dutyPeriods) {
        const roles = [];
        if (period.pilot) roles.push('Pilot');
        if (period.so) roles.push('SO');
        if (period.intel) roles.push('Intel');
        logWithLocation(`  - ${period.type} at t=${period.start.toFixed(1)}h-${period.end.toFixed(1)}h (${period.duration.toFixed(1)}h): ${roles.join(', ')}`);
      }
    }

    return { pilotsNeeded, sosNeeded, intelNeeded };
  }  // Track accepted missions for ODO alignment
  const acceptedMissions = [];

  // Track MOS cycling for fair duty distribution
  // Key: duty_type, Value: index of last used MOS in eligible list
  const dutyMOSCycleIndex = {};

  // Track duty IDs per unit and duty type
  // Key: unit:duty_type, Value: { dayCounter, shiftsPerDay, currentDayShiftCount }
  const dutyIDTracking = {};

  // Sort events: missions before duties at the same time
  events.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    // At same time: missions (0) before duties (1)
    const aOrder = a.type === 'mission_demand' ? 0 : 1;
    const bOrder = b.type === 'mission_demand' ? 0 : 1;
    return aOrder - bOrder;
  });

  // Log event queue summary
  logWithLocation(`========================================`);
  logWithLocation(`EVENT QUEUE SUMMARY`);
  logWithLocation(`========================================`);
  logWithLocation(`Total events: ${events.length}`);

  // Group events by time for summary
  const eventsByTime = new Map();
  for (const ev of events) {
    if (!eventsByTime.has(ev.time)) {
      eventsByTime.set(ev.time, []);
    }
    eventsByTime.get(ev.time).push(ev);
  }

  // Log first 20 time points
  let timeCount = 0;
  for (const [time, eventsAtTime] of eventsByTime) {
    if (timeCount >= 20) {
      logWithLocation(`... (remaining events omitted)`);
      break;
    }
    const missionCount = eventsAtTime.filter(e => e.type === 'mission_demand').length;
    const dutyCount = eventsAtTime.filter(e => e.type === 'duty_demand').length;
    logWithLocation(`t=${time.toFixed(1)}h: ${missionCount} mission(s), ${dutyCount} duty(s)`);
    timeCount++;
  }

  // Main event processing loop
  let missionIndex = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.time > horizon) break;
    logWithLocation(`\n`);
    logWithLocation(`===========================================`);
    logWithLocation(`Event ${i + 1}/${events.length} at t=${ev.time.toFixed(1)}h: type=${ev.type}`);
    logWithLocation(`===========================================`);

    // ---------------------------------------------------------------------------
    // MISSION DEMAND PROCESSING (Process missions FIRST)
    // ---------------------------------------------------------------------------
    if (ev.type === 'mission_demand') {
      processMissionDemand({
        ev,
        pools,
        missionTypes,
        preSpec,
        postSpec,
        turnSpec,
        scenario,
        results,
        missionIndex,
        acceptedMissions,
        getUpcomingDutyRequirements
      });
      continue;
    }

    // ---------------------------------------------------------------------------
    // DUTY DEMAND PROCESSING (Process duties AFTER missions)
    // ---------------------------------------------------------------------------
    if (ev.type === 'duty_demand') {
      processDutyDemand({
        ev,
        pools,
        unitList,
        scenario,
        results,
        acceptedMissions,
        dutyMOSCycleIndex,
        dutyIDTracking,
        events,
        currentEventIndex: i,
        missionTypes,
        preSpec,
        postSpec,
        turnSpec
      });
      continue;
    }
  }

  return results;
}

module.exports = { runSimulation };

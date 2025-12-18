// Stage 5a: Mission Processing
// Process mission demands and allocate resources

const { logWithLocation } = require('../../../utils');
const { sampleDist } = require('../helpers/distributions');
const { EquipmentPool } = require('../helpers/resources');

/**
 * Check crew availability and log status
 * 
 * @param {Object} params - Crew availability parameters
 * @returns {Object} Result with available counts
 */
function checkCrewAvailability(params) {
  const { pool, label, needed, totalAvailable, upcomingDuties, reserved } = params;
  const availableForMission = totalAvailable - reserved;

  logWithLocation(`  ${label}: Need ${needed}, Available ${totalAvailable}/${pool.total} (${reserved} reserved for duty)`);

  return {
    sufficient: availableForMission >= needed,
    availableForMission,
    totalAvailable
  };
}

/**
 * Allocate crew for a specific MOS type
 * 
 * @param {Object} params - Crew allocation parameters
 * @returns {Array} Array of crew assignments or empty array
 */
function allocateCrewForMOS(params) {
  const {
    pool,
    label,
    needed,
    rotationShifts,
    crewStartTime,
    crewHoldDuration,
    hasRotation,
    sequential,
    crewDistribution,
    ev
  } = params;

  if (needed === 0) return [];

  const availByShift = pool.availableByShift(ev.time);
  let assignments = [];

  if (hasRotation && rotationShifts && rotationShifts.length > 0) {
    // Rotation mode
    if (pool.workSchedule.shift_split_enabled) {
      logWithLocation(`  ${label} (rotation): Need ${needed}, Available ${availByShift.total}/${pool.total} (Shift 1: ${availByShift.shift1}, Shift 2: ${availByShift.shift2})`);
    } else {
      logWithLocation(`  ${label} (rotation): Need ${needed}, Available ${availByShift.total}/${pool.total}`);
    }

    const shifts = [];
    for (let s = 0; s < needed; s++) {
      shifts.push(s < rotationShifts.length ? rotationShifts[s] : rotationShifts[rotationShifts.length - 1]);
    }

    assignments = pool.tryAcquireShifts(crewStartTime, shifts, false, false, sequential, false, 0, crewDistribution) || [];
  } else {
    // Full mission mode
    if (pool.workSchedule.shift_split_enabled) {
      logWithLocation(`  ${label}${hasRotation ? ' (full mission)' : ''}: Need ${needed}, Available ${availByShift.total}/${pool.total} (Shift 1: ${availByShift.shift1}, Shift 2: ${availByShift.shift2})`);

      if (!hasRotation) {
        const shiftStatus = pool.getShiftStatus(ev.time);
        if (shiftStatus) {
          const s1 = shiftStatus.shift1;
          const s2 = shiftStatus.shift2;
          logWithLocation(`    Shift 1 [${s1.total}]: ${s1.available} avail, ${s1.onMission} on mission, ${s1.crewRest} crew rest, ${s1.daysOff} days off`);
          logWithLocation(`    Shift 2 [${s2.total}]: ${s2.available} avail, ${s2.onMission} on mission, ${s2.crewRest} crew rest, ${s2.daysOff} days off`);
        }
      }
    } else {
      logWithLocation(`  ${label}${hasRotation ? ' (full mission)' : ''}: Need ${needed}, Available ${availByShift.total}/${pool.total}`);
    }

    const shifts = new Array(needed).fill(crewHoldDuration);
    assignments = pool.tryAcquireShifts(crewStartTime, shifts, false, false, false, false, 0, crewDistribution) || [];
  }

  if (assignments.length > 0) {
    const availAfterByShift = pool.availableByShift(ev.time);
    const crewIds = assignments.map(a => a.id).join(', ');
    if (pool.workSchedule.shift_split_enabled) {
      logWithLocation(`  ✓ ${label} allocated: IDs [${crewIds}], Remaining ${availAfterByShift.total}/${pool.total} (Shift 1: ${availAfterByShift.shift1}, Shift 2: ${availAfterByShift.shift2})`);
    } else {
      logWithLocation(`  ✓ ${label} allocated: IDs [${crewIds}], Remaining ${availAfterByShift.total}/${pool.total}`);
    }
  }

  return assignments;
}

/**
 * Process a single mission demand event
 * 
 * @param {Object} params - Parameters for mission processing
 * @returns {Object} Result with success flag and mission data
 */
function processMissionDemand(params) {
  const {
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
  } = params;

  results.missions.requested++;
  const mt = missionTypes.get(ev.mission_type);
  if (!mt) return { success: false };

  const unit = ev.assignedUnit;
  if (!unit) return { success: false };

  const pool = pools[unit];

  let mountTime = 0;
  for (const ptype of mt.required_payload_types || []) {
    const spec = scenario.process_times?.mount_times?.[ptype];
    mountTime += sampleDist(spec);
  }
  const pre = sampleDist(preSpec);
  const flight = sampleDist(mt.flight_time);
  const transitIn = mt.flight_time.transit_in_hours || 0;
  const transitOut = mt.flight_time.transit_out_hours || 0;
  const post = sampleDist(postSpec);
  const turnaround = sampleDist(turnSpec);
  const duration = pre + mountTime + transitIn + flight + transitOut + post + turnaround;

  // Determine crew hold duration based on hold_crew_during_process_times flag
  const holdCrewDuringProcessTimes = scenario.process_times?.hold_crew_during_process_times !== false;
  const crewHoldDuration = holdCrewDuringProcessTimes
    ? duration
    : (transitIn + flight + transitOut);

  const crewStartTime = holdCrewDuringProcessTimes ? ev.time : (ev.time + pre + mountTime);

  const needPilot = mt.required_aircrew?.pilot || 0;
  const needSO = mt.required_aircrew?.so || 0;
  const needIntel = mt.required_aircrew?.intel || 0;
  const payloadTypes = mt.required_payload_types || [];

  // Check if duty lookahead is enabled
  const lookaheadEnabled = scenario.duty_requirements?.lookahead?.enabled !== false;
  const dutyLookaheadHours = scenario.duty_requirements?.lookahead?.hours || 72;

  const upcomingDuties = lookaheadEnabled
    ? getUpcomingDutyRequirements(unit, ev.time, dutyLookaheadHours)
    : { pilotsNeeded: 0, sosNeeded: 0, intelNeeded: 0 };

  // Check payload availability
  let payloadOk = true;
  for (const ptype of payloadTypes) {
    const p = pool.payloads[ptype] || new EquipmentPool(`payload:${unit}:${ptype}`, 0);
    if (p.availableAt(ev.time) < 1) {
      payloadOk = false;
      break;
    }
  }

  if (!payloadOk) {
    results.missions.rejected++;
    results.rejections.payload++;
    results.timeline.push({ type: 'rejection', time: ev.time, unit, mission_type: mt.name, reason: 'payload' });
    return { success: false };
  }

  // Check aircraft availability
  if (pool.aircraft.availableAt(ev.time) < 1) {
    results.missions.rejected++;
    results.rejections.aircraft++;
    const btR = results.by_type[mt.name] || { requested: 0, started: 0, completed: 0, rejected: 0 };
    btR.requested = (btR.requested || 0) + 1;
    btR.rejected = (btR.rejected || 0) + 1;
    results.by_type[mt.name] = btR;
    results.timeline.push({ type: 'rejection', time: ev.time, unit, mission_type: mt.name, reason: 'aircraft' });
    return { success: false };
  }

  logWithLocation(`[MISSION DEMAND]`);
  logWithLocation(`${mt.name} at t=${ev.time.toFixed(1)}h (duration=${duration.toFixed(1)}h) for ${unit}`);
  logWithLocation(`  Crew Distribution: ${mt.crew_distribution || 'concentrate'}`);

  // Check crew availability for all MOS types
  const crewChecks = [
    {
      name: 'pilot',
      needed: needPilot,
      pool: pool.pilot,
      label: 'Pilots',
      totalAvailable: pool.pilot.availableAt(ev.time),
      reserved: upcomingDuties.pilotsNeeded
    },
    {
      name: 'so',
      needed: needSO,
      pool: pool.so,
      label: 'SOs',
      totalAvailable: pool.so.availableAt(ev.time),
      reserved: upcomingDuties.sosNeeded
    },
    {
      name: 'intel',
      needed: needIntel,
      pool: pool.intel,
      label: 'Intel',
      totalAvailable: pool.intel.availableAt(ev.time),
      reserved: upcomingDuties.intelNeeded
    }
  ];

  for (const check of crewChecks) {
    if (check.needed > 0) {
      const availability = checkCrewAvailability(check);
      if (!availability.sufficient) {
        logWithLocation(`  ✗ REJECTED - ${check.label}: insufficient crew`);
        results.missions.rejected++;
        results.rejections[check.name]++;
        const btR = results.by_type[mt.name] || { requested: 0, started: 0, completed: 0, rejected: 0 };
        btR.requested = (btR.requested || 0) + 1;
        btR.rejected = (btR.rejected || 0) + 1;
        results.by_type[mt.name] = btR;
        results.timeline.push({ type: 'rejection', time: ev.time, unit, mission_type: mt.name, reason: check.name });
        return { success: false };
      }
    }
  }

  // Acquire resources
  for (const ptype of payloadTypes) {
    pool.payloads[ptype].tryAcquire(ev.time, duration, 1);
  }
  pool.aircraft.tryAcquire(ev.time, duration, 1);
  // Allocate crew
  const crewRotation = mt.crew_rotation;
  const crewDistribution = mt.crew_distribution || 'concentrate';
  const hasRotation = crewRotation && crewRotation.enabled;
  const sequential = hasRotation ? (crewRotation.sequential !== false) : false;

  const crewConfigs = [
    {
      name: 'pilot',
      label: 'Pilots',
      pool: pool.pilot,
      needed: needPilot,
      rotationShifts: hasRotation ? (crewRotation.pilot_shifts || []) : null,
      assignments: []
    },
    {
      name: 'so',
      label: 'SOs',
      pool: pool.so,
      needed: needSO,
      rotationShifts: hasRotation ? (crewRotation.so_shifts || []) : null,
      assignments: []
    },
    {
      name: 'intel',
      label: 'Intel',
      pool: pool.intel,
      needed: needIntel,
      rotationShifts: hasRotation ? (crewRotation.intel_shifts || []) : null,
      assignments: []
    }
  ];

  // Allocate crew for each MOS type
  for (const crew of crewConfigs) {
    crew.assignments = allocateCrewForMOS({
      pool: crew.pool,
      label: crew.label,
      needed: crew.needed,
      rotationShifts: crew.rotationShifts,
      crewStartTime,
      crewHoldDuration,
      hasRotation,
      sequential,
      crewDistribution,
      ev
    });
  }

  const pilotAssignments = crewConfigs[0].assignments;
  const soAssignments = crewConfigs[1].assignments;
  const intelAssignments = crewConfigs[2].assignments;

  pool.missionFinishes.push(ev.time + duration);

  results.missions.started++;
  const missionNumber = results.missions.started;
  const bt = results.by_type[mt.name] || { requested: 0, started: 0, completed: 0, rejected: 0 };
  bt.requested = (bt.requested || 0) + 1;
  bt.started = (bt.started || 0) + 1;
  results.by_type[mt.name] = bt;

  const t0 = ev.time;
  const t1 = t0 + pre;
  const t2 = t1 + mountTime;
  const t3 = t2 + transitIn;
  const t4 = t3 + flight;
  const t5 = t4 + transitOut;
  const t6 = t5 + post;
  const t7 = t6 + turnaround;

  // Track accepted mission for ODO alignment
  acceptedMissions.push({
    unit,
    missionType: mt.name,
    preflightStart: t0,
    postflightEnd: t6
  });

  results.timeline.push({
    type: 'mission',
    unit,
    mission_type: mt.name,
    mission_number: missionNumber,
    demand_time: t0,
    finish_time: t7,
    crew_hold_start: crewStartTime,
    crew_hold_end: crewStartTime + crewHoldDuration,
    segments: [
      { name: 'preflight', start: t0, end: t1 },
      { name: 'mount', start: t1, end: t2 },
      { name: 'transit_in', start: t2, end: t3 },
      { name: 'flight', start: t3, end: t4 },
      { name: 'transit_out', start: t4, end: t5 },
      { name: 'postflight', start: t5, end: t6 },
      { name: 'turnaround', start: t6, end: t7 },
    ],
    crew: {
      pilots: pilotAssignments,
      sos: soAssignments,
      intel: intelAssignments
    }
  });

  return { success: true, newMissionIndex: missionIndex + 1 };
}

module.exports = { processMissionDemand };

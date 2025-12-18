// Stage 5b: Duty Processing
// Process duty demands and allocate crew

const { logWithLocation } = require('../../../utils');
const { sampleDist } = require('../helpers/distributions');

/**
 * Process a single duty demand event
 * 
 * @param {Object} params - Parameters for duty processing
 * @returns {Object} Result with success flag
 */
function processDutyDemand(params) {
  const {
    ev,
    pools,
    unitList,
    scenario,
    results,
    acceptedMissions,
    dutyMOSCycleIndex,
    dutyIDTracking,
    events,
    currentEventIndex,
    missionTypes,
    preSpec,
    postSpec,
    turnSpec
  } = params;

  const canUsePilot = (ev.requires_pilot || 0) === 1;
  const canUseSO = (ev.requires_so || 0) === 1;
  const canUseIntel = (ev.requires_intel || 0) === 1;
  const isODO = ev.duty_type && ev.duty_type.toLowerCase() === 'odo';

  // Get shifts per day from scenario configuration for this duty type
  const dutyConfig = scenario.duty_requirements?.[ev.duty_type] || {};
  const shiftsPerDay = dutyConfig.shifts_per_day || 1;

  // Filter units based on mission split - skip units with 0% allocation
  const split = scenario.unit_policy?.mission_split || {};
  const activeUnits = unitList.filter(unit => {
    if (Object.keys(split).length === 0) return true;
    return (split[unit] || 0) > 0;
  });

  for (const unit of activeUnits) {
    const pool = pools[unit];
    const dutyCrewAssignments = { pilots: [], sos: [], intel: [] };
    let assigned = false;

    results.duties.requested++;

    let odoStart = ev.time;
    let odoDuration = ev.duration;
    let odoEnd = ev.time + ev.duration;

    // Calculate duty ID
    const dutyStartTimeForID = ev.time;
    const dutyKey = `${unit}:${ev.duty_type}`;
    if (!dutyIDTracking[dutyKey]) {
      dutyIDTracking[dutyKey] = {
        shiftsPerDay: shiftsPerDay,
        firstShiftStartHour: ev.start_hour || 0
      };
    }

    const tracking = dutyIDTracking[dutyKey];
    const startHour = tracking.firstShiftStartHour;
    const adjustedTime = dutyStartTimeForID - startHour;
    const dayNumber = Math.floor(adjustedTime / 24) + 1;
    const hourInDay = ((adjustedTime % 24) + 24) % 24;
    const shiftNumber = Math.floor(hourInDay / (24 / shiftsPerDay)) + 1;

    let dutyId;
    if (shiftsPerDay > 1) {
      dutyId = `${dayNumber}-${shiftNumber}`;
    } else {
      dutyId = `${dayNumber}`;
    }

    if (isODO) {
      const missionsOverlapping = [];

      // Check already accepted missions
      for (const acceptedMission of acceptedMissions) {
        if (acceptedMission.unit !== unit) continue;

        const missionPreflightStart = acceptedMission.preflightStart;
        const missionPostflightEnd = acceptedMission.postflightEnd;

        if (missionPreflightStart < odoEnd && missionPostflightEnd > ev.time) {
          missionsOverlapping.push({
            preflightStart: missionPreflightStart,
            postflightEnd: missionPostflightEnd,
            missionType: acceptedMission.missionType,
            source: 'accepted'
          });
        }
      }

      // Check upcoming mission demands in the event queue
      for (let j = currentEventIndex + 1; j < events.length; j++) {
        const futureEvent = events[j];
        if (futureEvent.type !== 'mission_demand') continue;
        if (futureEvent.assignedUnit !== unit) continue;

        if (futureEvent.time >= odoEnd) break;

        // Calculate actual mission duration
        const mt = missionTypes.get(futureEvent.mission_type);
        let estimatedMissionDuration = 8.0; // fallback
        if (mt) {
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
          estimatedMissionDuration = pre + mountTime + transitIn + flight + transitOut + post + turnaround;
        }
        const estimatedMissionEnd = futureEvent.time + estimatedMissionDuration;

        if (futureEvent.time < odoEnd && estimatedMissionEnd > ev.time) {
          missionsOverlapping.push({
            preflightStart: futureEvent.time,
            postflightEnd: estimatedMissionEnd,
            missionType: futureEvent.mission_type,
            source: 'planned'
          });
        }
      }

      if (missionsOverlapping.length > 0) {
        let earliestStart = Math.min(...missionsOverlapping.map(m => m.preflightStart));
        let latestEnd = Math.max(...missionsOverlapping.map(m => m.postflightEnd));

        // ODO only covers the intersection of mission operations and ODO window
        odoStart = Math.max(ev.time, earliestStart);
        odoEnd = Math.min(ev.time + ev.duration, latestEnd);
        odoDuration = odoEnd - odoStart;

        logWithLocation(`[ODO #${dutyId} - MISSION-ALIGNED]`);
        logWithLocation(`${unit}: ODO scheduled window t=${ev.time.toFixed(1)}h - ${(ev.time + ev.duration).toFixed(1)}h (${ev.duration.toFixed(1)}h)`);
        logWithLocation(`${unit}: Missions overlapping: ${missionsOverlapping.length}`);
        logWithLocation(`${unit}: Mission window: t=${earliestStart.toFixed(1)}h - ${latestEnd.toFixed(1)}h`);
        logWithLocation(`${unit}: ODO operational coverage t=${odoStart.toFixed(1)}h - ${odoEnd.toFixed(1)}h (${odoDuration.toFixed(1)}h)`);
      } else {
        logWithLocation(`[ODO #${dutyId} - SKIPPED for ${unit}]`);
        logWithLocation(`No mission operations in window t=${ev.time.toFixed(1)}h - ${(ev.time + ev.duration).toFixed(1)}h`);
        continue;
      }
    }

    const respectWorkSchedule = ev.respect_work_schedule ?? false;
    const ignoreWorkSchedule = !respectWorkSchedule;

    const dutyTypeUpper = ev.duty_type.toUpperCase();

    if (!isODO) {
      logWithLocation(`[${dutyTypeUpper} #${dutyId} DEMAND]`);
      logWithLocation(`${ev.duty_type} at t=${ev.time.toFixed(1)}h (duration=${ev.duration.toFixed(1)}h) for ${unit}`);
      logWithLocation(`  Eligible MOSs: ${[canUsePilot && 'Pilot', canUseSO && 'SO', canUseIntel && 'Intel'].filter(Boolean).join(', ')}`);
    } else {
      logWithLocation(`[${dutyTypeUpper} #${dutyId}] for ${unit}`);
      logWithLocation(`  Eligible MOSs: ${[canUsePilot && 'Pilot', canUseSO && 'SO', canUseIntel && 'Intel'].filter(Boolean).join(', ')}`);
    }

    // Build list of eligible MOS pools
    const eligibleMOS = [];
    if (canUsePilot) eligibleMOS.push({ name: 'pilot', pool: pool.pilot, type: 'pilots' });
    if (canUseSO) eligibleMOS.push({ name: 'so', pool: pool.so, type: 'sos' });
    if (canUseIntel) eligibleMOS.push({ name: 'intel', pool: pool.intel, type: 'intel' });

    // Cycle through eligible MOS types for fair distribution
    let allocated = false;

    if (!(dutyKey in dutyMOSCycleIndex)) {
      dutyMOSCycleIndex[dutyKey] = -1;
    }

    for (let attempt = 0; attempt < eligibleMOS.length && !allocated; attempt++) {
      dutyMOSCycleIndex[dutyKey] = (dutyMOSCycleIndex[dutyKey] + 1) % eligibleMOS.length;
      const mosEntry = eligibleMOS[dutyMOSCycleIndex[dutyKey]];

      const availableBefore = mosEntry.pool.availableAt(isODO ? odoStart : ev.time);
      const mosLabel = mosEntry.name === 'pilot' ? 'Pilots' : mosEntry.name === 'so' ? 'SOs' : 'Intel';
      logWithLocation(`  ${mosLabel}: Available ${availableBefore}/${mosEntry.pool.total}`);

      if (availableBefore > 0) {
        const shifts = [isODO ? odoDuration : ev.duration];
        const dutyRecoveryHours = ev.duty_recovery_hours || 0;
        const assignments = mosEntry.pool.tryAcquireShifts(
          isODO ? odoStart : ev.time,
          shifts,
          true,
          isODO,
          false,
          ignoreWorkSchedule,
          dutyRecoveryHours
        );
        if (assignments) {
          dutyCrewAssignments[mosEntry.type] = assignments;
          assigned = true;
          allocated = true;
          const availableAfter = mosEntry.pool.availableAt(isODO ? odoStart : ev.time);
          const crewIds = assignments.map(a => a.id).join(', ');
          logWithLocation(`  ✓ ${mosLabel.slice(0, -1)} allocated: ID [${crewIds}], Remaining ${availableAfter}/${mosEntry.pool.total}`);
          break;
        }
      }
    }

    if (!allocated) {
      logWithLocation(`  ✗ Duty allocation FAILED - no eligible MOS available`);
      results.duties.unfilled++;
    }

    if (assigned) {
      results.duties.filled++;
      const dutyStartTime = isODO ? odoStart : ev.time;
      const dutyEndTime = isODO ? odoEnd : (ev.time + ev.duration);

      results.timeline.push({
        type: 'duty',
        unit,
        duty_type: ev.duty_type,
        duty_id: dutyId,
        start: dutyStartTime,
        end: dutyEndTime,
        can_use_pilot: canUsePilot,
        can_use_so: canUseSO,
        can_use_intel: canUseIntel,
        crew: dutyCrewAssignments,
        ...(isODO && { mission_aligned: true, original_window: { start: ev.time, end: ev.time + ev.duration } })
      });

      const dutyRecoveryHours = ev.duty_recovery_hours || 0;
      if (dutyRecoveryHours > 0) {
        for (const pilotAssignment of dutyCrewAssignments.pilots) {
          results.timeline.push({
            type: 'duty_recovery',
            unit,
            crew_type: 'pilot',
            crew_id: pilotAssignment.id,
            start: dutyEndTime,
            end: dutyEndTime + dutyRecoveryHours,
            reason: `Post-${ev.duty_type} rest`
          });
        }

        for (const soAssignment of dutyCrewAssignments.sos) {
          results.timeline.push({
            type: 'duty_recovery',
            unit,
            crew_type: 'so',
            crew_id: soAssignment.id,
            start: dutyEndTime,
            end: dutyEndTime + dutyRecoveryHours,
            reason: `Post-${ev.duty_type} rest`
          });
        }
      }
    }
  }

  return { success: true };
}

module.exports = { processDutyDemand };

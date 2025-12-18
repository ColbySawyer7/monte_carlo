// Resource Management Module
// Manages resource pools and crew queues with scheduling logic

/**
 * EquipmentPool manages a fixed pool of equipment resources
 * Tracks availability, allocations, denials, and peak concurrent usage
 */
class EquipmentPool {
  constructor(name, total) {
    this.name = name;
    this.total = total;
    this.held = [];
    this.busyTime = 0;
    this.allocations = 0;
    this.denials = 0;
    this.usedCount = 0;
  }

  /**
   * Get number of resources available at a given time
   * @param {number} time - Current simulation time in hours
   * @returns {number} Number of available resources
   */
  availableAt(time) {
    this.held = this.held.filter(t => t > time);
    return this.total - this.held.length;
  }

  /**
   * Try to acquire resources for a duration
   * @param {number} time - Start time in hours
   * @param {number} durationHours - Duration to hold resources
   * @param {number} count - Number of resources to acquire
   * @returns {boolean} True if acquisition successful, false otherwise
   */
  tryAcquire(time, durationHours, count = 1) {
    const avail = this.availableAt(time);
    if (avail >= count) {
      const currentUsage = this.held.length;
      const newUsage = currentUsage + count;
      if (newUsage > this.usedCount) {
        this.usedCount = newUsage;
      }
      for (let i = 0; i < count; i++) {
        this.held.push(time + durationHours);
      }
      this.allocations += count;
      this.busyTime += durationHours * count;
      return true;
    }
    this.denials += count;
    return false;
  }

  /**
   * Calculate utilization as percentage of equipment used at least once
   * @returns {number} Utilization ratio (0-1) based on how many units were used
   */
  utilization() {
    if (this.total <= 0) return 0;
    return Math.min(1, this.usedCount / this.total);
  }

  /**
   * Calculate efficiency as aggregate busy time over available capacity
   * @param {number} horizonHours - Total simulation horizon
   * @returns {number} Efficiency ratio (0-1)
   */
  efficiency(horizonHours) {
    if (this.total <= 0 || horizonHours <= 0) return 0;
    return Math.min(1, this.busyTime / (this.total * horizonHours));
  }

  /**
   * Get comprehensive statistics for display
   * @param {number} horizonHours - Total simulation horizon
   * @returns {Object} Statistics including counts, percentages, and ratios
   */
  getStats(horizonHours) {
    const utilizationRatio = this.utilization();
    const efficiencyRatio = this.efficiency(horizonHours);
    const used = Math.round(this.total * utilizationRatio);
    const unused = this.total - used;
    return {
      total: this.total,
      used,
      unused,
      utilization: utilizationRatio,
      utilizationPercent: utilizationRatio * 100,
      efficiency: efficiencyRatio,
      efficiencyPercent: efficiencyRatio * 100,
      busyHours: this.busyTime,
      allocations: this.allocations,
      denials: this.denials
    };
  }
}

/**
 * CrewQueue manages crew members with rotation, rest periods, and fair scheduling
 * Supports both flight operations and duty assignments with different rotation policies
 */
class CrewQueue {
  constructor(name, total, crewRestHours = 0, workSchedule = null) {
    this.name = name;
    this.total = total;
    this.crew = [];
    this.busyTime = 0;
    this.allocations = 0;
    this.denials = 0;
    this.dutyAssignmentCount = {};      // Track how many duty assignments each crew member has
    this.dutyCycleResetTime = 0;        // Track when we last reset duty counters (every 30 days)
    this.dutyRotationPoolSize = null;   // Limit rotation pool to only crew needed for duty coverage
    this.crewRestHours = crewRestHours; // Crew rest period to add after each shift
    this.usedCrewIds = new Set();       // Track which crew members have been used at least once

    // Work schedule configuration
    this.workSchedule = workSchedule || {
      days_on: 365,           // Default: always on duty
      days_off: 0,
      daily_start_hour: 0,
      shift_split_enabled: false,
      shift_split_percent: 50,
      stagger_days_off: 0
    };

    // Initialize crew members all available at time 0
    for (let i = 0; i < total; i++) {
      // Assign crew to shifts if split is enabled
      let shiftAssignment = 1;
      if (this.workSchedule.shift_split_enabled) {
        const splitPercent = this.workSchedule.shift_split_percent || 50;
        const shift1Count = Math.round(total * (splitPercent / 100));
        shiftAssignment = i < shift1Count ? 1 : 2;
      }

      this.crew.push({
        id: i,
        availableAt: 0,
        missionCount: 0,
        shift: shiftAssignment
      });
      this.dutyAssignmentCount[i] = 0;
    }
  }

  /**
   * Check if crew member is in their "days on" period of the work cycle
   * @param {number} time - Current simulation time in hours
   * @param {number} crewMemberId - Crew member ID for stagger calculation
   * @returns {boolean} True if in days on period, false if in days off
   */
  isInDaysOnCycle(time, crewMemberId = 0) {
    const daysOn = this.workSchedule.days_on || 365;
    const daysOff = this.workSchedule.days_off || 0;

    if (daysOff === 0) return true; // Always on duty if no days off

    const cycleDays = daysOn + daysOff;
    const cycleHours = cycleDays * 24;

    // Align cycle start to daily_start_hour
    // If daily_start_hour is 8, then the first day starts at hour 8, not hour 0
    const dailyStartHour = this.workSchedule.daily_start_hour || 0;

    // Apply stagger offset based on crew member ID
    // Each crew member's cycle starts staggerDays later than the previous one
    const staggerDays = this.workSchedule.stagger_days_off || 0;
    const staggerHours = staggerDays * crewMemberId * 24;

    // Subtract both the stagger and the daily start hour offset
    // This ensures cycles start at the configured start hour of the day
    const adjustedTime = time - staggerHours - dailyStartHour;
    const timeInCycle = ((adjustedTime % cycleHours) + cycleHours) % cycleHours;
    const daysOnHours = daysOn * 24;

    return timeInCycle < daysOnHours;
  }

  /**
   * Check if crew member is in their working hours (not crew rest)
   * @param {Object} crewMember - Crew member object with shift assignment
   * @param {number} time - Current simulation time in hours
   * @returns {boolean} True if in working hours, false if in crew rest
   */
  isInWorkingHours(crewMember, time) {
    const dailyStartHour = this.workSchedule.daily_start_hour || 0;
    // Get crew rest hours from work schedule, not from constructor parameter
    const crewRestHours = this.workSchedule.daily_crew_rest_hours || 0;
    const workingHours = Math.max(0, 24 - crewRestHours);

    // If working hours is 24 or more, crew is always available
    if (workingHours >= 24) return true;

    // Calculate shift start hour
    let shiftStartHour = dailyStartHour;
    if (this.workSchedule.shift_split_enabled && crewMember.shift === 2) {
      // Shift 2 starts 12 hours after shift 1
      shiftStartHour = (dailyStartHour + 12) % 24;
    }

    // Calculate working period for this shift
    const workingEndHour = (shiftStartHour + workingHours) % 24;

    // Get current hour of day (0-23)
    const hourOfDay = time % 24;

    // Check if current hour is in working period
    if (workingEndHour > shiftStartHour) {
      // Working period doesn't wrap around midnight
      return hourOfDay >= shiftStartHour && hourOfDay < workingEndHour;
    } else {
      // Working period wraps around midnight
      return hourOfDay >= shiftStartHour || hourOfDay < workingEndHour;
    }
  }

  /**
   * Check if crew member is available for assignment based on work schedule
   * @param {Object} crewMember - Crew member object
   * @param {number} time - Current simulation time in hours
   * @returns {boolean} True if available (in days on cycle AND in working hours)
   */
  isScheduleAvailable(crewMember, time) {
    // Must be in days on cycle
    if (!this.isInDaysOnCycle(time, crewMember.id)) return false;

    // Must be in working hours (not crew rest)
    if (!this.isInWorkingHours(crewMember, time)) return false;

    return true;
  }

  /**
   * Set the duty rotation pool size to limit which crew members are used for rotating duties
   * This prevents unnecessary rotation through entire crew when only subset is needed
   * @param {number} poolSize - Number of crew members to include in duty rotation (null = all crew)
   */
  setDutyRotationPoolSize(poolSize) {
    this.dutyRotationPoolSize = poolSize;
  }

  /**
   * Reset duty assignment counters (typically done every 30 days)
   * @param {number} currentTime - Current simulation time in hours
   */
  resetDutyCounters(currentTime) {
    for (let id in this.dutyAssignmentCount) {
      this.dutyAssignmentCount[id] = 0;
    }
    this.dutyCycleResetTime = currentTime;
  }

  /**
   * Get number of crew members available at a given time
   * Considers both assignment availability and work schedule (days on/off, working hours)
   * @param {number} time - Current simulation time in hours
   * @returns {number} Number of available crew members
   */
  availableAt(time) {
    return this.crew.filter(c => {
      // Must not be currently assigned
      if (c.availableAt > time) return false;

      // Must be in work schedule (days on cycle and working hours)
      return this.isScheduleAvailable(c, time);
    }).length;
  }

  /**
   * Get number of crew members available by shift at a given time
   * Only applicable when shift split is enabled
   * @param {number} time - Current simulation time in hours
   * @returns {Object} Object with shift1, shift2, and total counts
   */
  availableByShift(time) {
    if (!this.workSchedule.shift_split_enabled) {
      const total = this.availableAt(time);
      return { shift1: total, shift2: 0, total };
    }

    let shift1Count = 0;
    let shift2Count = 0;

    for (const c of this.crew) {
      // Must not be currently assigned
      if (c.availableAt > time) continue;

      // Must be in work schedule (days on cycle and working hours)
      if (!this.isScheduleAvailable(c, time)) continue;

      // Count by shift
      if (c.shift === 1) {
        shift1Count++;
      } else if (c.shift === 2) {
        shift2Count++;
      }
    }

    return {
      shift1: shift1Count,
      shift2: shift2Count,
      total: shift1Count + shift2Count
    };
  }

  /**
   * Get detailed shift status showing why crew are unavailable
   * @param {number} time - Current simulation time in hours
   * @returns {Object} Detailed breakdown of crew availability by shift
   */
  getShiftStatus(time) {
    if (!this.workSchedule.shift_split_enabled) {
      return null;
    }

    const shift1Crew = this.crew.filter(c => c.shift === 1);
    const shift2Crew = this.crew.filter(c => c.shift === 2);

    const analyzeShift = (shiftCrew, shiftNum) => {
      let available = 0;
      let onMission = 0;
      let daysOff = 0;
      let crewRest = 0;

      for (const c of shiftCrew) {
        // Check if on mission
        if (c.availableAt > time) {
          onMission++;
          continue;
        }

        // Check if in days off period
        if (!this.isInDaysOnCycle(time, c.id)) {
          daysOff++;
          continue;
        }

        // Check if in crew rest period
        if (!this.isInWorkingHours(c, time)) {
          crewRest++;
          continue;
        }

        // Available
        available++;
      }

      return { available, onMission, daysOff, crewRest, total: shiftCrew.length };
    };

    return {
      shift1: analyzeShift(shift1Crew, 1),
      shift2: analyzeShift(shift2Crew, 2)
    };
  }

  /**
   * Try to acquire crew members with specific shift durations.
   * @param {number} time              - Start time in hours
   * @param {Array<number>} shifts     - Array of shift durations in hours
   * @param {boolean} isDuty           - Whether this is a duty assignment (vs flight)
   * @param {boolean} isContinuousDuty - Whether this is continuous duty like ODO
   * @param {boolean} forceSequential  - Force sequential shifts even if durations are identical
   * @param {boolean} ignoreWorkSchedule - Whether to ignore work schedule (for 24/7 duties like SDO/SDNCO)
   * @param {number} dutyRecoveryHours   - Hours of rest required after duty shift (for SDO/SDNCO)
   * @param {string} crewDistribution   - How to distribute missions: 'concentrate', 'even', 'random'
   * @returns {Array|null} Array of crew assignments or null if insufficient crew
   */
  tryAcquireShifts(time, shifts, isDuty = false, isContinuousDuty = false, forceSequential = false, ignoreWorkSchedule = false, dutyRecoveryHours = 0, crewDistribution = 'concentrate') {
    // shifts is array of durations [4, 4, 4, 4, 5] for sequential shifts
    // or [5, 5, 5, 5, 5, 5, 5] for concurrent crew (all same duration = concurrent)
    // isDuty flag indicates if this is a duty assignment (uses different rotation logic)
    // isContinuousDuty flag indicates if this is ODO (continuous operations, not fair rotation)

    // Reset duty counters every 30 days (720 hours) for rotating duties
    const dutyCycleDays = 30;
    const dutyCycleHours = dutyCycleDays * 24; // 720 hours
    if (isDuty && !isContinuousDuty && time >= this.dutyCycleResetTime + dutyCycleHours) {
      this.resetDutyCounters(time);
    }

    // Filter crew based on assignment availability AND work schedule
    const available = this.crew.filter(c => {
      // Must not be currently assigned
      if (c.availableAt > time) return false;

      // For 24/7 duties (SDO, SDNCO), ignore work schedule restrictions
      // For missions and ODO, respect work schedule (days on/off, working hours)
      if (ignoreWorkSchedule) return true;

      // Must be in work schedule (days on cycle and working hours)
      return this.isScheduleAvailable(c, time);
    });

    if (available.length < shifts.length) {
      this.denials += shifts.length;
      return null;
    }

    // Different prioritization for duty vs. flights
    if (isDuty && !isContinuousDuty) {

      // For rotating duty (SDO, SDNCO): only use limited pool of crew members
      // Filter to only include crew in the rotation pool (by ID)
      let dutyPool;
      if (this.dutyRotationPoolSize !== null && this.dutyRotationPoolSize > 0) {
        // Only include crew members with IDs in the rotation pool range
        dutyPool = available.filter(c => c.id < this.dutyRotationPoolSize);
        // If not enough crew in the pool are available, we have to deny
        if (dutyPool.length < shifts.length) {
          this.denials += shifts.length;
          return null;
        }
      } else {
        // No rotation pool limit - use all available crew (create copy to avoid reference issues)
        dutyPool = available.slice();
      }

      // Sort the duty pool: prioritize those with fewest duty assignments
      dutyPool.sort((a, b) => {
        const aCount = this.dutyAssignmentCount[a.id] || 0;
        const bCount = this.dutyAssignmentCount[b.id] || 0;
        if (aCount !== bCount) {
          return aCount - bCount; // Fewer duties first
        }
        // If equal duty assignments, prefer those available longer
        if (a.availableAt !== b.availableAt) {
          return a.availableAt - b.availableAt; // Earlier available first
        }
        return a.id - b.id; // Tie-breaker by ID
      });

      // Use the filtered and sorted duty pool instead of all available crew
      available.length = 0;
      available.push(...dutyPool);

    } else {
      // For flights and continuous duty (ODO): apply crew distribution strategy
      if (crewDistribution === 'rotate') {
        // Rotate distribution: cycle through all crew (prefer those with fewest missions)
        available.sort((a, b) => {
          // Prioritize by mission count first (prefer those with fewer missions)
          const aCount = a.missionCount || 0;
          const bCount = b.missionCount || 0;
          if (aCount !== bCount) {
            return aCount - bCount; // Fewer missions first
          }

          // Among crew with same mission count, prefer least recently used
          if (a.availableAt !== b.availableAt) {
            return a.availableAt - b.availableAt; // Lower availableAt = been waiting longer
          }

          return a.id - b.id; // Tie-breaker by ID
        });
      } else if (crewDistribution === 'random') {
        // Random distribution: shuffle available crew
        for (let i = available.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [available[i], available[j]] = [available[j], available[i]];
        }
      } else {
        // Concentrate (default): prefer crew who have flown before to minimize crew usage
        available.sort((a, b) => {
          // Prioritize by mission count first (prefer experienced crew)
          const aCount = a.missionCount || 0;
          const bCount = b.missionCount || 0;
          if (aCount !== bCount) {
            return bCount - aCount; // More missions first (higher count = more experienced)
          }

          // Among crew with same mission count, prefer most recently rested
          if (a.availableAt !== b.availableAt) {
            return b.availableAt - a.availableAt; // Higher availableAt = more recently rested
          }

          return a.id - b.id; // Tie-breaker by ID
        });
      }
    }

    // Determine if shifts are concurrent (all same duration) or sequential
    const allSameDuration = !forceSequential && shifts.every(d => d === shifts[0]);

    const assignments = [];

    if (allSameDuration) {
      // Concurrent crew - all work the same duration at the same time
      const duration = shifts[0];
      const shiftEnd = time + duration;

      for (let i = 0; i < shifts.length; i++) {
        const crewMember = available[i];
        // Add duty recovery period for all duty types (including ODO)
        if (isDuty && dutyRecoveryHours > 0) {
          crewMember.availableAt = shiftEnd + dutyRecoveryHours;
          this.busyTime += duration + dutyRecoveryHours; // Include rest in busy time tracking
        } else {
          crewMember.availableAt = shiftEnd;
          this.busyTime += duration;
        }
        this.allocations++;

        // Track that this crew member has been used
        this.usedCrewIds.add(crewMember.id);

        // Track mission count if this is a flight assignment (not duty)
        if (!isDuty) {
          crewMember.missionCount = (crewMember.missionCount || 0) + 1;
        }

        // Track duty assignments (only for rotating duties, not ODO)
        if (isDuty && !isContinuousDuty) {
          this.dutyAssignmentCount[crewMember.id] = (this.dutyAssignmentCount[crewMember.id] || 0) + 1;
        }

        assignments.push({
          id: crewMember.id,
          start: time,
          end: shiftEnd,
          shift: crewMember.shift
        });
      }

    } else {
      // Sequential shifts - each crew member starts when the previous one ends
      let currentShiftStart = time;
      const usedCrewInThisMission = new Set(); // Track crew used in this mission to ensure uniqueness

      for (let i = 0; i < shifts.length; i++) {
        const shiftDuration = shifts[i];
        const shiftEnd = currentShiftStart + shiftDuration;

        // For each shift, find ANY crew member available at that shift's start time
        // Re-evaluate available crew at this shift's start time (like a new mission demand)
        const availableAtShiftStart = this.crew.filter(c => {
          // Must not be currently assigned at shift start
          if (c.availableAt > currentShiftStart) return false;

          // Must not have already been used in this mission
          if (usedCrewInThisMission.has(c.id)) return false;

          // For 24/7 duties (SDO, SDNCO), ignore work schedule restrictions
          if (ignoreWorkSchedule) return true;

          // Must be in work schedule at shift start time
          return this.isScheduleAvailable(c, currentShiftStart);
        });

        if (availableAtShiftStart.length === 0) {
          // No crew available for this shift - deny entire mission
          this.denials += shifts.length;
          return null;
        }

        // Apply same sorting logic as before
        if (isDuty && !isContinuousDuty) {
          // For rotating duty: prioritize those with fewest duty assignments
          availableAtShiftStart.sort((a, b) => {
            const aCount = this.dutyAssignmentCount[a.id] || 0;
            const bCount = this.dutyAssignmentCount[b.id] || 0;
            if (aCount !== bCount) return aCount - bCount;
            if (a.availableAt !== b.availableAt) return a.availableAt - b.availableAt;
            return a.id - b.id;
          });
        } else {
          // For flights: use crew distribution preference
          if (crewDistribution === 'random') {
            // Random distribution: shuffle the available crew
            for (let i = availableAtShiftStart.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [availableAtShiftStart[i], availableAtShiftStart[j]] = [availableAtShiftStart[j], availableAtShiftStart[i]];
            }
          } else if (crewDistribution === 'rotate') {
            // Rotate distribution: prefer crew with fewest missions
            availableAtShiftStart.sort((a, b) => {
              const aCount = a.missionCount || 0;
              const bCount = b.missionCount || 0;
              if (aCount !== bCount) return aCount - bCount; // Fewer missions first
              if (a.availableAt !== b.availableAt) return a.availableAt - b.availableAt;
              return a.id - b.id;
            });
          } else {
            // Concentrate: prefer crew with more missions (experienced)
            availableAtShiftStart.sort((a, b) => {
              const aCount = a.missionCount || 0;
              const bCount = b.missionCount || 0;
              if (aCount !== bCount) return bCount - aCount; // More missions first
              if (a.availableAt !== b.availableAt) return b.availableAt - a.availableAt;
              return a.id - b.id;
            });
          }
        }

        const crewMember = availableAtShiftStart[0];

        // Mark this crew member as used in this mission
        usedCrewInThisMission.add(crewMember.id);

        // For all duties (including ODO), add duty recovery period after shift ends
        if (isDuty && dutyRecoveryHours > 0) {
          crewMember.availableAt = shiftEnd + dutyRecoveryHours;
          this.busyTime += shiftDuration + dutyRecoveryHours; // Include rest in busy time tracking
        } else {
          crewMember.availableAt = shiftEnd;
          this.busyTime += shiftDuration;
        }
        this.allocations++;

        // Track that this crew member has been used
        this.usedCrewIds.add(crewMember.id);

        // Track mission count if this is a flight assignment (not duty)
        if (!isDuty) {
          crewMember.missionCount = (crewMember.missionCount || 0) + 1;
        }

        // Track duty assignments (only for rotating duties, not ODO)
        if (isDuty && !isContinuousDuty) {
          this.dutyAssignmentCount[crewMember.id] = (this.dutyAssignmentCount[crewMember.id] || 0) + 1;
        }

        assignments.push({
          id: crewMember.id,
          start: currentShiftStart,
          end: shiftEnd,
          shift: crewMember.shift
        });

        // Next shift starts when this one ends
        currentShiftStart = shiftEnd;
      }
    }

    return assignments;
  }

  /**
   * Calculate utilization as percentage of crew used at least once
   * @returns {number} Utilization ratio (0-1) based on how many crew were used
   */
  utilization() {
    if (this.total <= 0) return 0;
    return Math.min(1, this.usedCrewIds.size / this.total);
  }

  /**
   * Calculate efficiency as aggregate busy time over available capacity
   * @param {number} horizonHours - Total simulation horizon
   * @returns {number} Efficiency ratio (0-1)
   */
  efficiency(horizonHours) {
    if (this.total <= 0 || horizonHours <= 0) return 0;
    return Math.min(1, this.busyTime / (this.total * horizonHours));
  }

  /**
   * Get comprehensive statistics for display including effective/busy/idle/unavailable counts
   * @param {number} horizonHours - Total simulation horizon
   * @param {number} effectiveTotal - Effective crew count after availability factors
   * @param {number} rawTotal - Raw headcount before availability factors
   * @returns {Object} Statistics for display
   */
  getStats(horizonHours, effectiveTotal, rawTotal) {
    const utilizationRatio = this.utilization();
    const efficiencyRatio = this.efficiency(horizonHours);
    const used = this.usedCrewIds.size;
    const busy = Math.min(used, effectiveTotal);
    const idle = Math.max(0, effectiveTotal - busy);
    const unavailable = rawTotal - effectiveTotal;
    return {
      total: this.total,
      rawTotal,
      effectiveTotal,
      used,
      busy,
      idle,
      unavailable,
      utilization: utilizationRatio,
      utilizationPercent: utilizationRatio * 100,
      efficiency: efficiencyRatio,
      efficiencyPercent: efficiencyRatio * 100,
      busyPercent: rawTotal > 0 ? (busy / rawTotal) * 100 : 0,
      idlePercent: rawTotal > 0 ? (idle / rawTotal) * 100 : 0,
      unavailablePercent: rawTotal > 0 ? (unavailable / rawTotal) * 100 : 0,
      trueForceUtilization: rawTotal > 0 ? (busy + unavailable) / rawTotal : 0,
      busyHours: this.busyTime,
      allocations: this.allocations,
      denials: this.denials
    };
  }
}

module.exports = { EquipmentPool, CrewQueue };

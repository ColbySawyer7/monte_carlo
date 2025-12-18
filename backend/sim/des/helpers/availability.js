// Availability Module
// Calculates personnel availability factors and generates availability timeline

/**
 * Calculate personnel availability factor based on various unavailability reasons
 * Accounts for leave, training, medical, work schedules, etc.
 * NOTE: Does NOT include SDO/SDNCO duty days - those are modeled separately as continuous duty requirements
 * @param {Object} availability - Personnel availability configuration
 * @param {Object} availability.work_schedule - Work schedule pattern
 * @param {number} availability.work_schedule.days_on - Days working per cycle
 * @param {number} availability.work_schedule.days_off - Days off per cycle
 * @param {number} availability.leave_days_annual - Annual leave days
 * @param {number} availability.range_days_annual - Range training days per year
 * @param {number} availability.safety_standdown_days_quarterly - Safety standdown days per quarter
 * @param {number} availability.medical_days_monthly - Medical/dental days per month
 * @param {number} availability.training_days_monthly - Training days per month
 * @returns {number} Availability factor (0-1) representing fraction of time personnel are available
 */
function calculateAvailabilityFactor(availability) {
  if (!availability) return 1.0;
  // Calculate total unavailable days per year
  // NOTE: SDO/SDNCO are NOT included here - they're modeled as continuous duty requirements
  let unavailableDays = 0;
  unavailableDays += availability.leave_days_annual || 0;
  unavailableDays += availability.range_days_annual || 0;
  unavailableDays += (availability.safety_standdown_days_quarterly || 0) * 4;
  unavailableDays += (availability.medical_days_monthly || 0) * 12;
  unavailableDays += (availability.training_days_monthly || 0) * 12;
  // Calculate availability as fraction of all calendar days (365)
  const totalDaysInYear = 365;
  const availableDays = totalDaysInYear - unavailableDays;
  const availabilityFactor = Math.max(0.1, availableDays / totalDaysInYear);
  return availabilityFactor;
}

/**
 * Generate availability timeline showing when personnel are unavailable and why
 * Samples at regular intervals and calculates expected unavailability for each reason
 * @param {Object} availability - Personnel availability configuration (see calculateAvailabilityFactor)
 * @param {number} totalPersonnel - Total number of personnel in this category
 * @param {number} horizonHours - Simulation horizon in hours
 * @param {Object} dutyRequirements - Duty requirements configuration (ODO, SDO, SDNCO)
 * @param {string} mos - MOS code to determine which duties apply
 * @returns {Array<Object>|null} Timeline array with availability snapshots or null if invalid
 */
function generateAvailabilityTimeline(availability, totalPersonnel, horizonHours, dutyRequirements = null, mos = null) {
  if (!availability || totalPersonnel === 0) return null;
  const timeline = [];
  const workSchedule = availability.work_schedule || { days_on: 7, days_off: 0 };
  const cycleDays = workSchedule.days_on + workSchedule.days_off;
  const sampleInterval = horizonHours < 24 ? 1 : 24;
  for (let t = 0; t <= horizonHours; t += sampleInterval) {
    const day = Math.floor(t / 24);
    // Calculate base availability from work schedule
    const cycleDay = day % cycleDays;
    const onWorkSchedule = cycleDay < workSchedule.days_on;
    // Calculate daily rates (convert annual/monthly/quarterly to daily)
    // NOTE: SDO/SDNCO are NOT included - they're modeled as continuous duty requirements
    const leaveProbability = (availability.leave_days_annual || 0) / 365;
    const rangeProbability = (availability.range_days_annual || 0) / 365;
    const medicalProbability = ((availability.medical_days_monthly || 0) * 12) / 365;
    const trainingProbability = ((availability.training_days_monthly || 0) * 12) / 365;
    const standdownProbability = ((availability.safety_standdown_days_quarterly || 0) * 4) / 365;
    // Calculate duty requirements if provided
    let odoCount = 0;
    let sdoCount = 0;
    let sdncoCount = 0;
    if (dutyRequirements && mos) {
      const isPilotTimeline = mos === '7318' || mos === 7318;
      const isSOTimeline = mos === '7314' || mos === 7314;
      const isIntelTimeline = mos === '0231' || mos === 231;

      // For each duty type, if this MOS can handle it (flag === 1), 
      // count the number of shifts that could draw from this MOS pool
      // Note: shifts_per_day is the total shifts needed, and since each shift
      // can be filled by any eligible MOS, we count all shifts that this MOS could potentially fill

      // ODO - check if this MOS can support it
      if (dutyRequirements.odo && dutyRequirements.odo.enabled) {
        const canUsePilot = (dutyRequirements.odo.requires_pilot || 0) === 1;
        const canUseSO = (dutyRequirements.odo.requires_so || 0) === 1;
        const canUseIntel = (dutyRequirements.odo.requires_intel || 0) === 1;

        if ((isPilotTimeline && canUsePilot) || (isSOTimeline && canUseSO) || (isIntelTimeline && canUseIntel)) {
          odoCount = dutyRequirements.odo.shifts_per_day || 0;
        }
      }

      // SDO - check if this MOS can support it
      if (dutyRequirements.sdo && dutyRequirements.sdo.enabled) {
        const canUsePilot = (dutyRequirements.sdo.requires_pilot || 0) === 1;
        const canUseSO = (dutyRequirements.sdo.requires_so || 0) === 1;
        const canUseIntel = (dutyRequirements.sdo.requires_intel || 0) === 1;

        if ((isPilotTimeline && canUsePilot) || (isSOTimeline && canUseSO) || (isIntelTimeline && canUseIntel)) {
          sdoCount = dutyRequirements.sdo.shifts_per_day || 0;
        }
      }

      // SDNCO - check if this MOS can support it
      if (dutyRequirements.sdnco && dutyRequirements.sdnco.enabled) {
        const canUsePilot = (dutyRequirements.sdnco.requires_pilot || 0) === 1;
        const canUseSO = (dutyRequirements.sdnco.requires_so || 0) === 1;
        const canUseIntel = (dutyRequirements.sdnco.requires_intel || 0) === 1;

        if ((isPilotTimeline && canUsePilot) || (isSOTimeline && canUseSO) || (isIntelTimeline && canUseIntel)) {
          sdncoCount = dutyRequirements.sdnco.shifts_per_day || 0;
        }
      }
    }
    // Calculate expected number unavailable for each reason
    const unavailable = {
      work_schedule: onWorkSchedule ? 0 : Math.round(totalPersonnel * (1 - workSchedule.days_on / cycleDays)),
      leave: Math.round(totalPersonnel * leaveProbability),
      range: Math.round(totalPersonnel * rangeProbability),
      medical: Math.round(totalPersonnel * medicalProbability),
      training: Math.round(totalPersonnel * trainingProbability),
      standdown: Math.round(totalPersonnel * standdownProbability),
      odo: odoCount,
      sdo: sdoCount,
      sdnco: sdncoCount,
    };
    const totalUnavailable = Object.values(unavailable).reduce((sum, val) => sum + val, 0);
    const available = Math.max(0, totalPersonnel - totalUnavailable);
    timeline.push({
      time: t,
      day: day,
      total: totalPersonnel,
      available: available,
      unavailable: unavailable
    });
  }
  return timeline;
}

module.exports = { calculateAvailabilityFactor, generateAvailabilityTimeline };

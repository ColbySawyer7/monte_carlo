// Utility functions for the backend

// Log level configuration
// Levels: 'silent' | 'error' | 'warn' | 'info' | 'verbose' | 'debug'
let currentLogLevel = 'verbose';

/**
 * Set the log level for DES engine logging
 * @param {string} level - Log level: 'silent', 'error', 'warn', 'info', 'verbose', or 'debug'
 */
function setLogLevel(level) {
  const validLevels = ['silent', 'error', 'warn', 'info', 'verbose', 'debug'];
  // Normalize to lowercase for case-insensitive matching
  const normalizedLevel = String(level).toLowerCase();
  if (validLevels.includes(normalizedLevel)) {
    currentLogLevel = normalizedLevel;
  } else {
    console.warn(`Invalid log level: ${level}. Valid levels: ${validLevels.join(', ')}`);
  }
}

/**
 * Get the current log level
 * @returns {string} Current log level
 */
function getLogLevel() {
  return currentLogLevel;
}

/**
 * Check if a log level should be displayed
 * @param {string} level - Log level to check
 * @returns {boolean} True if should log
 */
function shouldLog(level) {
  const levels = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    verbose: 4,
    debug: 5
  };
  
  // Normalize to lowercase for case-insensitive matching
  const normalizedLevel = String(level).toLowerCase();
  const normalizedCurrent = String(currentLogLevel).toLowerCase();
  
  const currentLevel = levels[normalizedCurrent] !== undefined ? levels[normalizedCurrent] : levels.verbose;
  const messageLevel = levels[normalizedLevel] !== undefined ? levels[normalizedLevel] : levels.verbose;
  
  // Log if message level is at or below current level threshold
  // silent (0) = log nothing, verbose (4) = log verbose and below, etc.
  // So we log when messageLevel <= currentLevel
  // Example: current='silent' (0), message='verbose' (4) → 4 <= 0 = false (don't log) ✓
  // Example: current='verbose' (4), message='verbose' (4) → 4 <= 4 = true (log) ✓
  return messageLevel <= currentLevel;
}

/**
 * Console.log with file location information and log level support
 * @param {string} message - The message to log
 * @param {*} data - Optional data to log (will be pretty-printed if object/array)
 * @param {string} level - Optional log level ('error', 'warn', 'info', 'verbose', 'debug'). Defaults to 'verbose'
 */
function logWithLocation(message, data = undefined, level = 'verbose') {
  // Check if we should log at this level
  if (!shouldLog(level)) {
    return;
  }
  
  const stack = new Error().stack.split('\n')[2]; // [2] to skip Error and this function
  const match = stack.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) ||
    stack.match(/at\s+(.+?):(\d+):(\d+)/);

  if (match) {
    const file = match[2] || match[1];
    const line = match[3] || match[2];
    const fileName = file.split('/').pop(); // Get just the filename

    if (data !== undefined) {
      if (typeof data === 'object' && data !== null) {
        console.log(`[${fileName}:${line}] ${message}`);
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`[${fileName}:${line}] ${message}`, data);
      }
    } else {
      console.log(`[${fileName}:${line}] ${message}`);
    }
  } else {
    console.log(`[unknown] ${message}`, data);
  }
}

/**
 * Log personnel availability configuration details
 * @param {Object} personnelAvailability - Personnel availability configuration from scenario
 * @param {Object} staffingData - Optional staffing data with total and effective counts
 */
function logPersonnelAvailability(personnelAvailability, staffingData = null) {
  const pilotConfig = personnelAvailability['7318'] || {};
  const soConfig = personnelAvailability['7314'] || {};
  const intelConfig = personnelAvailability['0231'] || {};

  // Calculate availability factors
  function calculateAvailabilityFactor(config) {
    const leaveDays = config.leave_days_annual || 0;
    const rangeDays = config.range_days_annual || 0;
    const safetyDays = (config.safety_standdown_days_quarterly || 0) * 4;
    const medicalDays = (config.medical_days_monthly || 0) * 12;
    const trainingDays = (config.training_days_monthly || 0) * 12;
    const totalUnavailableDays = leaveDays + rangeDays + safetyDays + medicalDays + trainingDays;
    return Math.max(0, Math.min(1, 1 - (totalUnavailableDays / 365)));
  }

  const pilotAvailability = calculateAvailabilityFactor(pilotConfig);
  const soAvailability = calculateAvailabilityFactor(soConfig);
  const intelAvailability = calculateAvailabilityFactor(intelConfig);

  // Extract crew rest hours
  const pilotCrewRestHours = pilotConfig.daily_crew_rest_hours || 0;
  const soCrewRestHours = soConfig.daily_crew_rest_hours || 0;
  const intelCrewRestHours = intelConfig.daily_crew_rest_hours || 0;

  // Extract work schedules
  const pilotWorkSchedule = pilotConfig.work_schedule;
  const soWorkSchedule = soConfig.work_schedule;
  const intelWorkSchedule = intelConfig.work_schedule;

  logWithLocation(`=========================================`);
  logWithLocation(`===== Personnel Availability Config =====`);
  logWithLocation(`=========================================`);
  logWithLocation(`7318:`);
  logWithLocation(`  Availability Factor: ${(pilotAvailability * 100).toFixed(1)}%`);
  logWithLocation(`  Crew Rest Hours: ${pilotCrewRestHours}h`);
  logWithLocation(`  Work Schedule:`);
  logWithLocation(`    Days On/Off: ${pilotWorkSchedule.days_on}/${pilotWorkSchedule.days_off}`);
  logWithLocation(`    Daily Start Hour: ${pilotWorkSchedule.daily_start_hour}`);
  logWithLocation(`    Shift Split: ${pilotWorkSchedule.shift_split_enabled ? 'Yes' : 'No'} (${pilotWorkSchedule.shift_split_percent}%)`);

  // Calculate and log working hours and time periods for pilots
  const pilotWorkingHours = Math.max(0, 24 - pilotCrewRestHours);
  const pilotShift1Start = pilotWorkSchedule.daily_start_hour || 0;
  const pilotShift1End = (pilotShift1Start + pilotWorkingHours) % 24;
  logWithLocation(`    Working Hours: ${pilotWorkingHours}h per day`);
  if (pilotWorkSchedule.shift_split_enabled) {
    const pilotShift2Start = (pilotShift1Start + 12) % 24;
    const pilotShift2End = (pilotShift2Start + pilotWorkingHours) % 24;

    // Calculate personnel counts per shift if staffing data provided
    let shift1Personnel = '';
    let shift2Personnel = '';
    if (staffingData && staffingData.pilot) {
      const splitPercent = pilotWorkSchedule.shift_split_percent || 50;
      const totalPilots = staffingData.pilot.total;
      const effectivePilots = staffingData.pilot.effective;
      const shift1Total = Math.round(totalPilots * (splitPercent / 100));
      const shift2Total = totalPilots - shift1Total;
      const shift1Effective = Math.round(effectivePilots * (splitPercent / 100));
      const shift2Effective = effectivePilots - shift1Effective;
      shift1Personnel = ` (Total: ${shift1Total}, Effective: ${shift1Effective})`;
      shift2Personnel = ` (Total: ${shift2Total}, Effective: ${shift2Effective})`;
    }

    logWithLocation(`    Shift 1: Works ${String(pilotShift1Start).padStart(2, '0')}00-${String(pilotShift1End).padStart(2, '0')}00, Rest ${String(pilotShift1End).padStart(2, '0')}00-${String(pilotShift1Start).padStart(2, '0')}00${shift1Personnel}`);
    logWithLocation(`    Shift 2: Works ${String(pilotShift2Start).padStart(2, '0')}00-${String(pilotShift2End).padStart(2, '0')}00, Rest ${String(pilotShift2End).padStart(2, '0')}00-${String(pilotShift2Start).padStart(2, '0')}00${shift2Personnel}`);

    // Log per-unit breakdown if available
    if (staffingData && staffingData.units) {
      const splitPercent = pilotWorkSchedule.shift_split_percent || 50;
      for (const [unit, counts] of Object.entries(staffingData.units)) {
        if (counts.pilot && (counts.pilot.total > 0 || counts.pilot.effective > 0)) {
          const shift1Total = Math.round(counts.pilot.total * (splitPercent / 100));
          const shift2Total = counts.pilot.total - shift1Total;
          const shift1Effective = Math.round(counts.pilot.effective * (splitPercent / 100));
          const shift2Effective = counts.pilot.effective - shift1Effective;
          logWithLocation(`      ${unit}: Shift 1 (Total: ${shift1Total}, Effective: ${shift1Effective}), Shift 2 (Total: ${shift2Total}, Effective: ${shift2Effective})`);
        }
      }
    }
  } else {
    // Calculate personnel counts if staffing data provided
    let personnelInfo = '';
    if (staffingData && staffingData.pilot) {
      const totalPilots = staffingData.pilot.total;
      const effectivePilots = staffingData.pilot.effective;
      personnelInfo = ` (Total: ${totalPilots}, Effective: ${effectivePilots})`;
    }
    logWithLocation(`    Working Period: ${String(pilotShift1Start).padStart(2, '0')}00-${String(pilotShift1End).padStart(2, '0')}00${personnelInfo}`);
    logWithLocation(`    Crew Rest Period: ${String(pilotShift1End).padStart(2, '0')}00-${String(pilotShift1Start).padStart(2, '0')}00`);

    // Log per-unit breakdown if available
    if (staffingData && staffingData.units) {
      for (const [unit, counts] of Object.entries(staffingData.units)) {
        if (counts.pilot && (counts.pilot.total > 0 || counts.pilot.effective > 0)) {
          logWithLocation(`      ${unit}: Total: ${counts.pilot.total}, Effective: ${counts.pilot.effective}`);
        }
      }
    }
  }

  logWithLocation(`  Unavailability Breakdown:`);
  logWithLocation(`    Leave: ${pilotConfig.leave_days_annual} days/year`);
  logWithLocation(`    Range: ${pilotConfig.range_days_annual} days/year`);
  logWithLocation(`    Safety Standdown: ${pilotConfig.safety_standdown_days_quarterly} days/qtr`);
  logWithLocation(`    Medical: ${pilotConfig.medical_days_monthly} days/month`);
  logWithLocation(`    Training: ${pilotConfig.training_days_monthly} days/month`);
  logWithLocation(`7314:`);
  logWithLocation(`  Availability Factor: ${(soAvailability * 100).toFixed(1)}%`);
  logWithLocation(`  Crew Rest Hours: ${soCrewRestHours}h`);
  logWithLocation(`  Work Schedule:`);
  logWithLocation(`    Days On/Off: ${soWorkSchedule.days_on}/${soWorkSchedule.days_off}`);
  logWithLocation(`    Daily Start Hour: ${soWorkSchedule.daily_start_hour}`);
  logWithLocation(`    Shift Split: ${soWorkSchedule.shift_split_enabled ? 'Yes' : 'No'} (${soWorkSchedule.shift_split_percent}%)`);

  // Calculate and log working hours and time periods for SOs
  const soWorkingHours = Math.max(0, 24 - soCrewRestHours);
  const soShift1Start = soWorkSchedule.daily_start_hour || 0;
  const soShift1End = (soShift1Start + soWorkingHours) % 24;
  logWithLocation(`    Working Hours: ${soWorkingHours}h per day`);
  if (soWorkSchedule.shift_split_enabled) {
    const soShift2Start = (soShift1Start + 12) % 24;
    const soShift2End = (soShift2Start + soWorkingHours) % 24;

    // Calculate personnel counts per shift if staffing data provided
    let shift1Personnel = '';
    let shift2Personnel = '';
    if (staffingData && staffingData.so) {
      const splitPercent = soWorkSchedule.shift_split_percent || 50;
      const totalSOs = staffingData.so.total;
      const effectiveSOs = staffingData.so.effective;
      const shift1Total = Math.round(totalSOs * (splitPercent / 100));
      const shift2Total = totalSOs - shift1Total;
      const shift1Effective = Math.round(effectiveSOs * (splitPercent / 100));
      const shift2Effective = effectiveSOs - shift1Effective;
      shift1Personnel = ` (Total: ${shift1Total}, Effective: ${shift1Effective})`;
      shift2Personnel = ` (Total: ${shift2Total}, Effective: ${shift2Effective})`;
    }

    logWithLocation(`    Shift 1: Works ${String(soShift1Start).padStart(2, '0')}00-${String(soShift1End).padStart(2, '0')}00, Rest ${String(soShift1End).padStart(2, '0')}00-${String(soShift1Start).padStart(2, '0')}00${shift1Personnel}`);
    logWithLocation(`    Shift 2: Works ${String(soShift2Start).padStart(2, '0')}00-${String(soShift2End).padStart(2, '0')}00, Rest ${String(soShift2End).padStart(2, '0')}00-${String(soShift2Start).padStart(2, '0')}00${shift2Personnel}`);

    // Log per-unit breakdown if available
    if (staffingData && staffingData.units) {
      const splitPercent = soWorkSchedule.shift_split_percent || 50;
      for (const [unit, counts] of Object.entries(staffingData.units)) {
        if (counts.so && (counts.so.total > 0 || counts.so.effective > 0)) {
          const shift1Total = Math.round(counts.so.total * (splitPercent / 100));
          const shift2Total = counts.so.total - shift1Total;
          const shift1Effective = Math.round(counts.so.effective * (splitPercent / 100));
          const shift2Effective = counts.so.effective - shift1Effective;
          logWithLocation(`      ${unit}: Shift 1 (Total: ${shift1Total}, Effective: ${shift1Effective}), Shift 2 (Total: ${shift2Total}, Effective: ${shift2Effective})`);
        }
      }
    }
  } else {
    // Calculate personnel counts if staffing data provided
    let personnelInfo = '';
    if (staffingData && staffingData.so) {
      const totalSOs = staffingData.so.total;
      const effectiveSOs = staffingData.so.effective;
      personnelInfo = ` (Total: ${totalSOs}, Effective: ${effectiveSOs})`;
    }
    logWithLocation(`    Working Period: ${String(soShift1Start).padStart(2, '0')}00-${String(soShift1End).padStart(2, '0')}00${personnelInfo}`);
    logWithLocation(`    Crew Rest Period: ${String(soShift1End).padStart(2, '0')}00-${String(soShift1Start).padStart(2, '0')}00`);

    // Log per-unit breakdown if available
    if (staffingData && staffingData.units) {
      for (const [unit, counts] of Object.entries(staffingData.units)) {
        if (counts.so && (counts.so.total > 0 || counts.so.effective > 0)) {
          logWithLocation(`      ${unit}: Total: ${counts.so.total}, Effective: ${counts.so.effective}`);
        }
      }
    }
  }

  logWithLocation(`  Unavailability Breakdown:`);
  logWithLocation(`    Leave: ${soConfig.leave_days_annual} days/year`);
  logWithLocation(`    Range: ${soConfig.range_days_annual} days/year`);
  logWithLocation(`    Safety Standdown: ${soConfig.safety_standdown_days_quarterly} days/qtr`);
  logWithLocation(`    Medical: ${soConfig.medical_days_monthly} days/month`);
  logWithLocation(`    Training: ${soConfig.training_days_monthly} days/month`);
  logWithLocation(`0231:`);
  logWithLocation(`  Availability Factor: ${(intelAvailability * 100).toFixed(1)}%`);
  logWithLocation(`  Crew Rest Hours: ${intelCrewRestHours}h`);
  logWithLocation(`  Work Schedule:`);
  logWithLocation(`    Days On/Off: ${intelWorkSchedule.days_on}/${intelWorkSchedule.days_off}`);
  logWithLocation(`    Daily Start Hour: ${intelWorkSchedule.daily_start_hour}`);
  logWithLocation(`    Shift Split: ${intelWorkSchedule.shift_split_enabled ? 'Yes' : 'No'} (${intelWorkSchedule.shift_split_percent}%)`);

  // Calculate and log working hours and time periods for Intel
  const intelWorkingHours = Math.max(0, 24 - intelCrewRestHours);
  const intelShift1Start = intelWorkSchedule.daily_start_hour || 0;
  const intelShift1End = (intelShift1Start + intelWorkingHours) % 24;
  logWithLocation(`    Working Hours: ${intelWorkingHours}h per day`);
  if (intelWorkSchedule.shift_split_enabled) {
    const intelShift2Start = (intelShift1Start + 12) % 24;
    const intelShift2End = (intelShift2Start + intelWorkingHours) % 24;

    // Calculate personnel counts per shift if staffing data provided
    let shift1Personnel = '';
    let shift2Personnel = '';
    if (staffingData && staffingData.intel) {
      const splitPercent = intelWorkSchedule.shift_split_percent || 50;
      const totalIntel = staffingData.intel.total;
      const effectiveIntel = staffingData.intel.effective;
      const shift1Total = Math.round(totalIntel * (splitPercent / 100));
      const shift2Total = totalIntel - shift1Total;
      const shift1Effective = Math.round(effectiveIntel * (splitPercent / 100));
      const shift2Effective = effectiveIntel - shift1Effective;
      shift1Personnel = ` (Total: ${shift1Total}, Effective: ${shift1Effective})`;
      shift2Personnel = ` (Total: ${shift2Total}, Effective: ${shift2Effective})`;
    }

    logWithLocation(`    Shift 1: Works ${String(intelShift1Start).padStart(2, '0')}00-${String(intelShift1End).padStart(2, '0')}00, Rest ${String(intelShift1End).padStart(2, '0')}00-${String(intelShift1Start).padStart(2, '0')}00${shift1Personnel}`);
    logWithLocation(`    Shift 2: Works ${String(intelShift2Start).padStart(2, '0')}00-${String(intelShift2End).padStart(2, '0')}00, Rest ${String(intelShift2End).padStart(2, '0')}00-${String(intelShift2Start).padStart(2, '0')}00${shift2Personnel}`);

    // Log per-unit breakdown if available
    if (staffingData && staffingData.units) {
      const splitPercent = intelWorkSchedule.shift_split_percent || 50;
      for (const [unit, counts] of Object.entries(staffingData.units)) {
        if (counts.intel && (counts.intel.total > 0 || counts.intel.effective > 0)) {
          const shift1Total = Math.round(counts.intel.total * (splitPercent / 100));
          const shift2Total = counts.intel.total - shift1Total;
          const shift1Effective = Math.round(counts.intel.effective * (splitPercent / 100));
          const shift2Effective = counts.intel.effective - shift1Effective;
          logWithLocation(`      ${unit}: Shift 1 (Total: ${shift1Total}, Effective: ${shift1Effective}), Shift 2 (Total: ${shift2Total}, Effective: ${shift2Effective})`);
        }
      }
    }
  } else {
    // Calculate personnel counts if staffing data provided
    let personnelInfo = '';
    if (staffingData && staffingData.intel) {
      const totalIntel = staffingData.intel.total;
      const effectiveIntel = staffingData.intel.effective;
      personnelInfo = ` (Total: ${totalIntel}, Effective: ${effectiveIntel})`;
    }
    logWithLocation(`    Working Period: ${String(intelShift1Start).padStart(2, '0')}00-${String(intelShift1End).padStart(2, '0')}00${personnelInfo}`);
    logWithLocation(`    Crew Rest Period: ${String(intelShift1End).padStart(2, '0')}00-${String(intelShift1Start).padStart(2, '0')}00`);

    // Log per-unit breakdown if available
    if (staffingData && staffingData.units) {
      for (const [unit, counts] of Object.entries(staffingData.units)) {
        if (counts.intel && (counts.intel.total > 0 || counts.intel.effective > 0)) {
          logWithLocation(`      ${unit}: Total: ${counts.intel.total}, Effective: ${counts.intel.effective}`);
        }
      }
    }
  }

  logWithLocation(`  Unavailability Breakdown:`);
  logWithLocation(`    Leave: ${intelConfig.leave_days_annual} days/year`);
  logWithLocation(`    Range: ${intelConfig.range_days_annual} days/year`);
  logWithLocation(`    Safety Standdown: ${intelConfig.safety_standdown_days_quarterly} days/qtr`);
  logWithLocation(`    Medical: ${intelConfig.medical_days_monthly} days/month`);
  logWithLocation(`    Training: ${intelConfig.training_days_monthly} days/month\n`);
}

/**
 * Log resource pool initialization details for a unit
 * @param {string} unit - Unit identifier
 * @param {number} acTotal - Total aircraft count
 * @param {number} effectivePilots - Effective pilot count after availability factor
 * @param {number} fullPilots - Full pilot count before availability factor
 * @param {number} effectiveSOs - Effective SO count after availability factor
 * @param {number} fullSOs - Full SO count before availability factor
 * @param {number} effectiveIntel - Effective Intel count after availability factor
 * @param {number} fullIntel - Full Intel count before availability factor
 * @param {number} pilotAvailability - Pilot availability factor (0-1)
 * @param {number} soAvailability - SO availability factor (0-1)
 * @param {number} intelAvailability - Intel availability factor (0-1)
 * @param {number} pilotCrewRestHours - Pilot crew rest hours
 * @param {number} soCrewRestHours - SO crew rest hours
 * @param {number} intelCrewRestHours - Intel crew rest hours
 * @param {Object} payloads - Payload counts by type
 */
function logResourcePoolsInitialized(unit, acTotal, effectivePilots, fullPilots, effectiveSOs, fullSOs, effectiveIntel, fullIntel, pilotAvailability, soAvailability, intelAvailability, pilotCrewRestHours, soCrewRestHours, intelCrewRestHours, payloads) {
  logWithLocation(`==========================================`);
  logWithLocation(`======= Resource Pools Initialized =======`);
  logWithLocation(`==========================================`);
  logWithLocation(`  Unit: ${unit}`);
  logWithLocation(`  Aircraft: ${acTotal}`);
  logWithLocation(`  Crew:`);
  logWithLocation(`    Pilots: ${effectivePilots}/${fullPilots} effective (${(pilotAvailability * 100).toFixed(1)}% availability, ${pilotCrewRestHours}h rest)`);
  logWithLocation(`    SOs: ${effectiveSOs}/${fullSOs} effective (${(soAvailability * 100).toFixed(1)}% availability, ${soCrewRestHours}h rest)`);
  logWithLocation(`    Intel: ${effectiveIntel}/${fullIntel} effective (${(intelAvailability * 100).toFixed(1)}% availability, ${intelCrewRestHours}h rest)`);
  const payloadEntries = Object.entries(payloads);
  if (payloadEntries.length > 0) {
    logWithLocation(`  Payloads:`);
    for (const [ptype, count] of payloadEntries) {
      logWithLocation(`    ${ptype}: ${count}`);
    }
  } else {
    logWithLocation(`  Payloads: none configured`);
  }
  logWithLocation(`\n`);
}

module.exports = { 
  logWithLocation, 
  logPersonnelAvailability, 
  logResourcePoolsInitialized,
  setLogLevel,
  getLogLevel
};

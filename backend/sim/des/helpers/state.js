// State Management Module
// Derives initial resource counts from database state snapshot

/**
 * Loads the state snapshot
 * @param {Object} state - State snapshot with tables property
 * @param {Object} state.tables - Database tables (v_aircraft, v_payload, v_staffing, v_unit)
 * @returns {Object|null} Initial resources configuration or null if invalid
 * 
 * @returns {Array<string>} returns.units   - List of unit names
 * @returns {Object} returns.aircraftByUnit - FMC aircraft count per unit
 * @returns {Object} returns.payloadByUnit  - Payload counts by type and unit
 * @returns {Object} returns.staffingByUnit - Crew counts by role (pilot/so) and unit
 */
function loadState(state) {
  if (!state || !state.tables) return null;

  function getRows(key) {
    const t = state.tables[key];
    return t && Array.isArray(t.rows) ? t.rows : [];
  }

  const unitRows = getRows('v_unit');
  const aircraftRows = getRows('v_aircraft');
  const payloadRows = getRows('v_payload');
  const staffingRows = getRows('v_staffing');

  // Units (from v_unit)
  const units = Array.from(new Set(
    unitRows.map(r => r['Unit']).filter(Boolean)
  ));

  // FMC aircraft by unit (from v_aircraft)
  const aircraftByUnit = {};
  for (const r of aircraftRows) {
    const status = r['Status'];
    const unit = r['Unit'];
    if (status === 'FMC' && unit) {
      aircraftByUnit[unit] = (aircraftByUnit[unit] || 0) + 1;
    }
  }

  // Payload counts by type and unit (from v_payload)
  const payloadByUnit = {};
  for (const r of payloadRows) {
    const unit = r['Unit'] || 'UNKNOWN';
    const type = r['Type'];
    if (!type) continue;
    if (!payloadByUnit[unit]) payloadByUnit[unit] = {};
    payloadByUnit[unit][type] = (payloadByUnit[unit][type] || 0) + 1;
  }

  // Staffing by MOS and unit (from v_staffing)
  const staffingByUnit = {};
  for (const r of staffingRows) {
    const unitName = r['Unit Name'];
    const mos = r['MOS Number'];
    if (!unitName || !mos) continue;
    if (!staffingByUnit[unitName]) staffingByUnit[unitName] = { pilot: 0, so: 0, intel: 0 };
    if (mos === '7318') staffingByUnit[unitName].pilot += 1;
    if (mos === '7314') staffingByUnit[unitName].so += 1;
    if (mos === '0231') staffingByUnit[unitName].intel += 1;
  }

  // Ensure all units seen in resources are included
  const allUnits = new Set(units);
  Object.keys(aircraftByUnit).forEach(u => allUnits.add(u));
  Object.keys(payloadByUnit).forEach(u => allUnits.add(u));
  Object.keys(staffingByUnit).forEach(u => allUnits.add(u));

  return {
    units: Array.from(allUnits),
    aircraftByUnit,
    payloadByUnit,
    staffingByUnit,
  };
}

module.exports = { loadState };

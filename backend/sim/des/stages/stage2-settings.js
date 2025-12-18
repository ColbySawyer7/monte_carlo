// Stage 2: Settings
// Load initial state and apply resource overrides

const { loadState } = require('../helpers/state');

/**
 * Apply settings: load initial state and apply overrides
 * 
 * @param {Object} settings - Settings containing state and overrides
 * @param {Object} scenario - Scenario configuration for required payload types
 * @returns {Object} Initial state with units, aircraft, staffing, and payload counts
 */
function applySettings(settings, scenario) {
  // Load state from database snapshot
  let initial;
  if (settings.state) {
    initial = loadState(settings.state);
  }
  if (!initial || !initial.units || initial.units.length === 0) {
    throw new Error('Simulation requires a valid state snapshot with tables: v_aircraft, v_payload, v_staffing, v_unit');
  }

  // Apply resource overrides
  const overrides = settings.overrides && settings.overrides.units ? settings.overrides.units : null;
  if (overrides) {
    // Collect all payload types required by scenario to ensure pools exist when overridden
    const requiredPayloadTypes = new Set();
    for (const mt of scenario.mission_types || []) {
      (mt.required_payload_types || []).forEach(p => requiredPayloadTypes.add(p));
    }

    for (const [unit, o] of Object.entries(overrides)) {
      if (!initial.units.includes(unit)) initial.units.push(unit);
      if (o && typeof o === 'object') {
        if (Number.isFinite(o.aircraft)) initial.aircraftByUnit[unit] = Math.max(0, Math.floor(o.aircraft));
        // Ensure crew object exists
        if (!initial.staffingByUnit[unit]) initial.staffingByUnit[unit] = { pilot: 0, so: 0, intel: 0 };
        if (Number.isFinite(o.pilot)) initial.staffingByUnit[unit].pilot = Math.max(0, Math.floor(o.pilot));
        if (Number.isFinite(o.so)) initial.staffingByUnit[unit].so = Math.max(0, Math.floor(o.so));
        if (Number.isFinite(o.intel)) initial.staffingByUnit[unit].intel = Math.max(0, Math.floor(o.intel));
        // Payload overrides
        // 1) Per-type mapping (preferred): payload_by_type = { 'SkyTower II': 6, ... }
        if (o.payload_by_type && typeof o.payload_by_type === 'object') {
          if (!initial.payloadByUnit[unit]) initial.payloadByUnit[unit] = {};
          for (const [ptype, valRaw] of Object.entries(o.payload_by_type)) {
            const val = Number.isFinite(valRaw) ? Math.max(0, Math.floor(valRaw)) : 0;
            initial.payloadByUnit[unit][ptype] = val;
          }
        }
        // 2) Backward compat: uniform count per type (applies to existing and required types)
        if (Number.isFinite(o.payload_per_type)) {
          const val = Math.max(0, Math.floor(o.payload_per_type));
          if (!initial.payloadByUnit[unit]) initial.payloadByUnit[unit] = {};
          // Include existing types and those required by scenario
          const types = new Set([...Object.keys(initial.payloadByUnit[unit] || {}), ...requiredPayloadTypes]);
          for (const t of types) {
            initial.payloadByUnit[unit][t] = val;
          }
        }
      }
    }
  }

  return initial;
}

module.exports = { applySettings };

// Shared test fixtures for DES Engine tests
// Contains mock state data and scenario configurations used across test files

/**
 * Mock state data representing a typical squadron resource snapshot
 * Includes two units (HMLA-167, HMLA-267) with aircraft, payload, and staffing
 */
const mockState = {
  tables: {
    v_aircraft: {
      rows: [
        { Unit: 'HMLA-167', Status: 'FMC' },
        { Unit: 'HMLA-167', Status: 'FMC' },
        { Unit: 'HMLA-267', Status: 'FMC' },
        { Unit: 'HMLA-267', Status: 'NMC' }, // NMC should be excluded
      ]
    },
    v_payload: {
      rows: [
        { Unit: 'HMLA-167', Type: 'SkyTower II' },
        { Unit: 'HMLA-167', Type: 'SkyTower II' },
        { Unit: 'HMLA-167', Type: 'Hellfire' },
        { Unit: 'HMLA-267', Type: 'SkyTower II' },
      ]
    },
    v_staffing: {
      rows: [
        { 'Unit Name': 'HMLA-167', 'MOS Number': '7318' }, // Pilot
        { 'Unit Name': 'HMLA-167', 'MOS Number': '7318' },
        { 'Unit Name': 'HMLA-167', 'MOS Number': '7314' }, // SO
        { 'Unit Name': 'HMLA-267', 'MOS Number': '7318' },
        { 'Unit Name': 'HMLA-267', 'MOS Number': '7314' },
        { 'Unit Name': 'HMLA-267', 'MOS Number': '7314' },
      ]
    },
    v_unit: {
      rows: [
        { Unit: 'HMLA-167' },
        { Unit: 'HMLA-267' },
      ]
    }
  }
};

/**
 * Basic scenario configuration for testing
 * 24-hour simulation with ISR missions requiring SkyTower II payload
 * Deterministic demand every 8 hours, 60/40 split between units
 */
const basicScenario = {
  horizon_hours: 24,
  mission_types: [
    {
      name: 'ISR',
      flight_time: { type: 'deterministic', value_hours: 2, transit_in_hours: 0.5, transit_out_hours: 0.5 },
      required_aircrew: { pilot: 1, so: 1 },
      required_payload_types: ['SkyTower II']
    }
  ],
  demand: [
    {
      type: 'deterministic',
      mission_type: 'ISR',
      every_hours: 8,
      start_at_hours: 0
    }
  ],
  process_times: {
    preflight: { type: 'deterministic', value_hours: 0.5 },
    postflight: { type: 'deterministic', value_hours: 0.25 },
    turnaround: { type: 'deterministic', value_hours: 0.25 },
    hold_crew_during_process_times: true,
    mount_times: {
      'SkyTower II': { type: 'deterministic', value_hours: 0.5 }
    }
  },
  unit_policy: {
    mission_split: { 'HMLA-167': 0.6, 'HMLA-267': 0.4 }
  }
};

module.exports = {
  mockState,
  basicScenario
};

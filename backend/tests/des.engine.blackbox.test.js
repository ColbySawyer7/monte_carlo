// Blackbox Tests for DES Engine
// Tests only the public API contract and observable behavior
// No knowledge of internal implementation details or data structures

const { runSimulation, loadState } = require('../sim/des/engine');
const { mockState, basicScenario } = require('./fixtures');

describe('DES Engine - Blackbox Tests', () => {

  describe('loadState - API Contract', () => {
    test('returns an object when given valid state', () => {
      const result = loadState(mockState);

      expect(result).toBeTruthy();
      expect(typeof result).toBe('object');
    });

    test('returns null for invalid inputs', () => {
      expect(loadState(null)).toBeNull();
      expect(loadState(undefined)).toBeNull();
      expect(loadState({})).toBeNull();
      expect(loadState({ tables: null })).toBeNull();
    });

    test('handles empty state without throwing errors', () => {
      const emptyState = {
        tables: {
          v_aircraft: { rows: [] },
          v_payload: { rows: [] },
          v_staffing: { rows: [] },
          v_unit: { rows: [] }
        }
      };

      expect(() => loadState(emptyState)).not.toThrow();
      const result = loadState(emptyState);
      expect(result).toBeTruthy();
    });
  });

  describe('runSimulation - API Contract', () => {
    test('returns a result object with required top-level properties', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      expect(result).toBeTruthy();
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('horizon_hours');
      expect(result).toHaveProperty('missions');
      expect(result).toHaveProperty('rejections');
      expect(result).toHaveProperty('utilization');
    });

    test('returns consistent horizon value', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      expect(result.horizon_hours).toBe(basicScenario.horizon_hours);
    });

    test('mission counts are non-negative numbers', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      expect(typeof result.missions.requested).toBe('number');
      expect(typeof result.missions.started).toBe('number');
      expect(typeof result.missions.completed).toBe('number');
      expect(typeof result.missions.rejected).toBe('number');

      expect(result.missions.requested).toBeGreaterThanOrEqual(0);
      expect(result.missions.started).toBeGreaterThanOrEqual(0);
      expect(result.missions.completed).toBeGreaterThanOrEqual(0);
      expect(result.missions.rejected).toBeGreaterThanOrEqual(0);
    });

    test('mission accounting is consistent', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      // Logical invariants that must hold
      expect(result.missions.started + result.missions.rejected).toBe(result.missions.requested);
      expect(result.missions.completed).toBeLessThanOrEqual(result.missions.started);
    });

    test('rejection counts are non-negative', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      expect(result.rejections.aircraft).toBeGreaterThanOrEqual(0);
      expect(result.rejections.pilot).toBeGreaterThanOrEqual(0);
      expect(result.rejections.so).toBeGreaterThanOrEqual(0);
      expect(result.rejections.payload).toBeGreaterThanOrEqual(0);
    });

    test('utilization values are between 0 and 1', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      for (const [unit, util] of Object.entries(result.utilization)) {
        expect(util.aircraft).toBeGreaterThanOrEqual(0);
        expect(util.aircraft).toBeLessThanOrEqual(1);
        expect(util.pilot).toBeGreaterThanOrEqual(0);
        expect(util.pilot).toBeLessThanOrEqual(1);
        expect(util.so).toBeGreaterThanOrEqual(0);
        expect(util.so).toBeLessThanOrEqual(1);
      }
    });

    test('throws error when state is missing', async () => {
      await expect(runSimulation(basicScenario, {})).rejects.toThrow();
      await expect(runSimulation(basicScenario, { state: null })).rejects.toThrow();
    });

    test('handles zero-demand scenario gracefully', async () => {
      const noDemandScenario = {
        ...basicScenario,
        demand: []
      };

      const result = await runSimulation(noDemandScenario, { state: mockState });

      expect(result.missions.requested).toBe(0);
      expect(result.missions.started).toBe(0);
      expect(result.missions.rejected).toBe(0);
    });

    test('produces different results for different random seeds (stochastic)', async () => {
      const stochasticScenario = {
        ...basicScenario,
        mission_types: [
          {
            name: 'ISR',
            flight_time: { type: 'exponential', rate_per_hour: 0.5 },
            required_aircrew: { pilot: 1, so: 1 },
            required_payload_types: ['SkyTower II']
          }
        ]
      };

      const result1 = await runSimulation(stochasticScenario, { state: mockState });
      const result2 = await runSimulation(stochasticScenario, { state: mockState });

      // With stochastic elements, results should differ (not guaranteed but highly likely)
      // This tests that the function actually uses randomness
      expect(result1).not.toEqual(result2);
    });

    test('handles multiple mission types without error', async () => {
      const multiTypeScenario = {
        ...basicScenario,
        mission_types: [
          ...basicScenario.mission_types,
          {
            name: 'CAS',
            flight_time: { type: 'deterministic', value_hours: 1.5, transit_in_hours: 0.25, transit_out_hours: 0.25 },
            required_aircrew: { pilot: 1, so: 0 },
            required_payload_types: ['Hellfire']
          }
        ],
        demand: [
          ...basicScenario.demand,
          {
            type: 'deterministic',
            mission_type: 'CAS',
            every_hours: 6,
            start_at_hours: 1
          }
        ]
      };

      expect(async () => {
        await runSimulation(multiTypeScenario, { state: mockState });
      }).not.toThrow();

      const result = await runSimulation(multiTypeScenario, { state: mockState });
      expect(result.missions.requested).toBeGreaterThan(0);
    });

    test('respects horizon boundary', async () => {
      const shortHorizon = {
        ...basicScenario,
        horizon_hours: 1
      };

      const result = await runSimulation(shortHorizon, { state: mockState });

      expect(result.horizon_hours).toBe(1);
      // With 1-hour horizon and 8-hour demand interval, should only request 1 mission
      expect(result.missions.requested).toBeLessThanOrEqual(2);
    });

    test('handles Poisson demand distribution', async () => {
      const poissonScenario = {
        ...basicScenario,
        demand: [
          {
            type: 'poisson',
            mission_type: 'ISR',
            rate_per_hour: 0.5
          }
        ]
      };

      expect(async () => {
        await runSimulation(poissonScenario, { state: mockState });
      }).not.toThrow();

      const result = await runSimulation(poissonScenario, { state: mockState });
      expect(result.missions.requested).toBeGreaterThanOrEqual(0);
    });

    test('handles resource overrides', async () => {
      const overrides = {
        units: {
          'HMLA-167': {
            aircraft: 10,
            pilot: 20,
            so: 15,
            payload_by_type: {
              'SkyTower II': 20
            }
          }
        }
      };

      expect(async () => {
        await runSimulation(basicScenario, { state: mockState, overrides });
      }).not.toThrow();

      const result = await runSimulation(basicScenario, { state: mockState, overrides });
      expect(result.missions.rejected).toBeLessThanOrEqual(result.missions.requested);
    });

    test('more resources lead to fewer rejections', async () => {
      const baseResult = await runSimulation(basicScenario, { state: mockState });

      const moreResources = {
        units: {
          'HMLA-167': {
            aircraft: 20,
            pilot: 50,
            so: 50,
            payload_by_type: {
              'SkyTower II': 50,
              'Hellfire': 50
            }
          },
          'HMLA-267': {
            aircraft: 20,
            pilot: 50,
            so: 50,
            payload_by_type: {
              'SkyTower II': 50
            }
          }
        }
      };

      const enhancedResult = await runSimulation(basicScenario, { state: mockState, overrides: moreResources });

      // More resources should result in equal or fewer rejections
      expect(enhancedResult.missions.rejected).toBeLessThanOrEqual(baseResult.missions.rejected);
    });

    test('handles duty requirements configuration', async () => {
      const dutyScenario = {
        ...basicScenario,
        duty_requirements: {
          odo: {
            enabled: true,
            shifts_per_day: 3,
            hours_per_shift: 8,
            requires_pilot: 1,
            requires_so: 0
          }
        }
      };

      expect(async () => {
        await runSimulation(dutyScenario, { state: mockState });
      }).not.toThrow();

      const result = await runSimulation(dutyScenario, { state: mockState });
      expect(result).toBeTruthy();
    });

    test('handles personnel availability configuration', async () => {
      const availabilityScenario = {
        ...basicScenario,
        personnel_availability: {
          '7318': {
            leave_days_annual: 30,
            daily_crew_rest_hours: 12,
            work_schedule: { days_on: 5, days_off: 2 }
          },
          '7314': {
            leave_days_annual: 30,
            daily_crew_rest_hours: 12,
            work_schedule: { days_on: 7, days_off: 0 }
          }
        }
      };

      expect(async () => {
        await runSimulation(availabilityScenario, { state: mockState });
      }).not.toThrow();

      const result = await runSimulation(availabilityScenario, { state: mockState });
      expect(result).toBeTruthy();
    });

    test('handles crew rotation configuration', async () => {
      const rotationScenario = {
        ...basicScenario,
        mission_types: [
          {
            name: 'Long ISR',
            flight_time: { type: 'deterministic', value_hours: 8, transit_in_hours: 0.5, transit_out_hours: 0.5 },
            required_aircrew: { pilot: 2, so: 1 },
            required_payload_types: ['SkyTower II'],
            crew_rotation: {
              enabled: true,
              pilot_shifts: [4, 4],
              so_shifts: [9]
            }
          }
        ],
        demand: [
          {
            type: 'deterministic',
            mission_type: 'Long ISR',
            every_hours: 12,
            start_at_hours: 0
          }
        ]
      };

      expect(async () => {
        await runSimulation(rotationScenario, { state: mockState });
      }).not.toThrow();

      const result = await runSimulation(rotationScenario, { state: mockState });
      expect(result.missions.started).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Functional Requirements - End-to-End Behavior', () => {
    test('simulation completes within reasonable time', async () => {
      const start = Date.now();
      await runSimulation(basicScenario, { state: mockState });
      const duration = Date.now() - start;

      // Should complete in less than 5 seconds for a 24-hour simulation
      expect(duration).toBeLessThan(5000);
    });

    test('handles large horizon without crashing', async () => {
      const largeHorizon = {
        ...basicScenario,
        horizon_hours: 8760 // 1 year
      };

      expect(async () => {
        await runSimulation(largeHorizon, { state: mockState });
      }).not.toThrow();
    });

    test('deterministic scenario produces consistent mission counts', async () => {
      // With all deterministic settings, same inputs should give same outputs
      const result1 = await runSimulation(basicScenario, { state: mockState });
      const result2 = await runSimulation(basicScenario, { state: mockState });

      expect(result1.missions.requested).toBe(result2.missions.requested);
    });

    test('validates scenario configuration before running', async () => {
      const invalidScenario = {
        // Missing required fields
        horizon_hours: 24
      };

      // Should throw an error for invalid scenario configuration
      await expect(runSimulation(invalidScenario, { state: mockState })).rejects.toThrow();
    });

    test('resource constraints affect mission success rate', async () => {
      const constrainedScenario = {
        ...basicScenario,
        demand: [
          {
            type: 'deterministic',
            mission_type: 'ISR',
            every_hours: 1, // Very high demand
            start_at_hours: 0
          }
        ]
      };

      const result = await runSimulation(constrainedScenario, { state: mockState });

      // With limited resources and high demand, some missions should be rejected
      expect(result.missions.rejected).toBeGreaterThan(0);
    });
  });
});

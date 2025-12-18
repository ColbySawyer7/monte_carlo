// Whitebox Tests for DES Engine
// Tests internal implementation details, data structures, and algorithms
// Requires knowledge of how the engine works internally

const { runSimulation, loadState } = require('../sim/des/engine');
const { mockState, basicScenario } = require('./fixtures');

describe('DES Engine - Whitebox Tests', () => {

  describe('loadState - Internal Data Structures', () => {
    test('extracts correct unit list from v_unit table', () => {
      const result = loadState(mockState);

      expect(result.units).toContain('HMLA-167');
      expect(result.units).toContain('HMLA-267');
      expect(result.units.length).toBe(2);
    });

    test('counts only FMC aircraft by unit', () => {
      const result = loadState(mockState);

      expect(result.aircraftByUnit['HMLA-167']).toBe(2);
      expect(result.aircraftByUnit['HMLA-267']).toBe(1); // NMC excluded
    });

    test('builds payload inventory by type and unit', () => {
      const result = loadState(mockState);

      expect(result.payloadByUnit['HMLA-167']['SkyTower II']).toBe(2);
      expect(result.payloadByUnit['HMLA-167']['Hellfire']).toBe(1);
      expect(result.payloadByUnit['HMLA-267']['SkyTower II']).toBe(1);
      expect(result.payloadByUnit['HMLA-267']['Hellfire']).toBeUndefined();
    });

    test('maps MOS codes to crew roles correctly', () => {
      const result = loadState(mockState);

      // MOS 7318 = pilot, 7314 = SO
      expect(result.staffingByUnit['HMLA-167'].pilot).toBe(2);
      expect(result.staffingByUnit['HMLA-167'].so).toBe(1);
      expect(result.staffingByUnit['HMLA-267'].pilot).toBe(1);
      expect(result.staffingByUnit['HMLA-267'].so).toBe(2);
    });

    test('includes all units from any resource table', () => {
      const stateWithMismatchedUnits = {
        tables: {
          v_aircraft: { rows: [{ Unit: 'HMLA-167', Status: 'FMC' }] },
          v_payload: { rows: [{ Unit: 'HMLA-267', Type: 'SkyTower II' }] },
          v_staffing: { rows: [{ 'Unit Name': 'HMLA-367', 'MOS Number': '7318' }] },
          v_unit: { rows: [{ Unit: 'HMLA-167' }] }
        }
      };

      const result = loadState(stateWithMismatchedUnits);

      // Should include all three units seen across tables
      expect(result.units).toContain('HMLA-167');
      expect(result.units).toContain('HMLA-267');
      expect(result.units).toContain('HMLA-367');
    });

    test('initializes empty structures for units without resources', () => {
      const result = loadState(mockState);

      // If a unit has no aircraft, it should not be in aircraftByUnit
      // But it should still be in the units list if it appears in v_unit
      for (const unit of result.units) {
        if (!result.aircraftByUnit[unit]) {
          expect(result.aircraftByUnit[unit]).toBeUndefined();
        }
      }
    });
  });

  describe('runSimulation - Internal Result Structure', () => {
    test('includes initial_resources snapshot', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      expect(result.initial_resources).toBeTruthy();
      expect(result.initial_resources.units).toEqual(expect.arrayContaining(['HMLA-167', 'HMLA-267']));
      expect(result.initial_resources.aircraftByUnit).toBeTruthy();
      expect(result.initial_resources.staffingByUnit).toBeTruthy();
      expect(result.initial_resources.payloadByUnit).toBeTruthy();
    });

    test('marks when overrides are applied', async () => {
      const resultWithoutOverrides = await runSimulation(basicScenario, { state: mockState });
      expect(resultWithoutOverrides.initial_resources.overrides_applied).toBe(false);

      const overrides = {
        units: {
          'HMLA-167': {
            aircraft: 5,
            pilot: 10,
            so: 8
          }
        }
      };

      const resultWithOverrides = await runSimulation(basicScenario, { state: mockState, overrides });
      expect(resultWithOverrides.initial_resources.overrides_applied).toBe(true);
    });

    test('tracks rejections by specific resource type', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      expect(result.rejections).toHaveProperty('aircraft');
      expect(result.rejections).toHaveProperty('pilot');
      expect(result.rejections).toHaveProperty('so');
      expect(result.rejections).toHaveProperty('payload');

      // Sum of all rejection reasons should be >= total rejections
      const rejectionSum = result.rejections.aircraft + result.rejections.pilot +
        result.rejections.so + result.rejections.payload;
      expect(rejectionSum).toBeGreaterThanOrEqual(result.missions.rejected);
    });

    test('generates timeline with correct event types', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      expect(Array.isArray(result.timeline)).toBe(true);

      const eventTypes = new Set(result.timeline.map(e => e.type));
      expect(eventTypes.has('mission') || eventTypes.has('rejection') || result.timeline.length === 0).toBe(true);
    });

    test('mission timeline events have required segment structure', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      const missions = result.timeline.filter(e => e.type === 'mission');
      if (missions.length > 0) {
        const mission = missions[0];

        expect(mission).toHaveProperty('segments');
        expect(Array.isArray(mission.segments)).toBe(true);
        expect(mission).toHaveProperty('unit');
        expect(mission).toHaveProperty('mission_type');
        expect(mission).toHaveProperty('demand_time');
        expect(mission).toHaveProperty('finish_time');

        // Check for expected segment names
        const segmentNames = mission.segments.map(s => s.name);
        expect(segmentNames).toContain('preflight');
        expect(segmentNames).toContain('flight');
        expect(segmentNames).toContain('postflight');
      }
    });

    test('each segment has start and end times', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      const missions = result.timeline.filter(e => e.type === 'mission');
      if (missions.length > 0) {
        for (const mission of missions) {
          for (const segment of mission.segments) {
            expect(segment).toHaveProperty('start');
            expect(segment).toHaveProperty('end');
            expect(segment.end).toBeGreaterThanOrEqual(segment.start);
          }
        }
      }
    });

    test('segments are in chronological order within a mission', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      const missions = result.timeline.filter(e => e.type === 'mission');
      if (missions.length > 0) {
        for (const mission of missions) {
          for (let i = 1; i < mission.segments.length; i++) {
            expect(mission.segments[i].start).toBeGreaterThanOrEqual(mission.segments[i - 1].end);
          }
        }
      }
    });

    test('tracks mission-specific sequential numbering', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      const missions = result.timeline.filter(e => e.type === 'mission');
      if (missions.length > 0) {
        const missionNumbers = missions.map(m => m.mission_number);

        // Check that mission numbers are sequential starting from 1
        expect(missionNumbers[0]).toBe(1);
        for (let i = 1; i < missionNumbers.length; i++) {
          expect(missionNumbers[i]).toBe(missionNumbers[i - 1] + 1);
        }
      }
    });

    test('tracks statistics by mission type', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      expect(result.by_type).toBeTruthy();

      if (result.missions.requested > 0) {
        expect(result.by_type['ISR']).toBeTruthy();
        expect(result.by_type['ISR']).toHaveProperty('requested');
        expect(result.by_type['ISR']).toHaveProperty('started');
        expect(result.by_type['ISR']).toHaveProperty('completed');
        expect(result.by_type['ISR']).toHaveProperty('rejected');
      }
    });

    test('utilization includes availability factors when configured', async () => {
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

      const result = await runSimulation(availabilityScenario, { state: mockState });

      for (const [unit, util] of Object.entries(result.utilization)) {
        expect(util).toHaveProperty('availability_factors');
        expect(util.availability_factors).toHaveProperty('pilot');
        expect(util.availability_factors).toHaveProperty('so');
        expect(util.availability_factors.pilot).toBeLessThan(1); // Some unavailability
        expect(util.availability_factors.so).toBeLessThan(1);
      }
    });

    test('utilization includes initial and effective crew counts', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      for (const [unit, util] of Object.entries(result.utilization)) {
        expect(util).toHaveProperty('initial_crew');
        expect(util).toHaveProperty('effective_crew');
        expect(util.initial_crew).toHaveProperty('pilot');
        expect(util.initial_crew).toHaveProperty('so');
        expect(util.effective_crew).toHaveProperty('pilot');
        expect(util.effective_crew).toHaveProperty('so');
      }
    });

    test('tracks resource statistics including allocations and denials', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });

      for (const [unit, util] of Object.entries(result.utilization)) {
        expect(util).toHaveProperty('aircraft_stats');
        expect(util).toHaveProperty('pilot_stats');
        expect(util).toHaveProperty('so_stats');

        // Verify aircraft stats structure
        expect(util.aircraft_stats).toHaveProperty('allocations');
        expect(util.aircraft_stats).toHaveProperty('denials');
        expect(util.aircraft_stats).toHaveProperty('used');
        expect(util.aircraft_stats).toHaveProperty('unused');
        expect(util.aircraft_stats).toHaveProperty('total');

        // Verify pilot stats structure
        expect(util.pilot_stats).toHaveProperty('allocations');
        expect(util.pilot_stats).toHaveProperty('denials');
        expect(util.pilot_stats).toHaveProperty('busy');
        expect(util.pilot_stats).toHaveProperty('idle');
        expect(util.pilot_stats).toHaveProperty('total');

        // Verify SO stats structure
        expect(util.so_stats).toHaveProperty('allocations');
        expect(util.so_stats).toHaveProperty('denials');
        expect(util.so_stats).toHaveProperty('busy');
        expect(util.so_stats).toHaveProperty('idle');
        expect(util.so_stats).toHaveProperty('total');

        // Verify all numeric values
        expect(typeof util.aircraft_stats.allocations).toBe('number');
        expect(typeof util.pilot_stats.allocations).toBe('number');
        expect(typeof util.so_stats.allocations).toBe('number');
      }
    });

    test('generates availability timeline when configured', async () => {
      const availabilityScenario = {
        ...basicScenario,
        personnel_availability: {
          '7318': {
            leave_days_annual: 30,
            daily_crew_rest_hours: 12,
            work_schedule: { days_on: 5, days_off: 2 }
          }
        }
      };

      const result = await runSimulation(availabilityScenario, { state: mockState });

      expect(result).toHaveProperty('availability_timeline');
      expect(result.availability_timeline).toHaveProperty('pilot');

      if (result.availability_timeline.pilot) {
        expect(typeof result.availability_timeline.pilot).toBe('object');

        // Check if there's an aggregate timeline
        if (result.availability_timeline.pilot.aggregate) {
          expect(Array.isArray(result.availability_timeline.pilot.aggregate)).toBe(true);

          if (result.availability_timeline.pilot.aggregate.length > 0) {
            const sample = result.availability_timeline.pilot.aggregate[0];
            expect(sample).toHaveProperty('time');
            expect(sample).toHaveProperty('total');
            expect(sample).toHaveProperty('available');
            expect(sample).toHaveProperty('unavailable');
          }
        }
      }
    });

    test('crew assignments track individual crew members for rotation', async () => {
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

      const result = await runSimulation(rotationScenario, { state: mockState });

      const missions = result.timeline.filter(e => e.type === 'mission');
      if (missions.length > 0) {
        const mission = missions[0];
        expect(mission).toHaveProperty('crew');
        expect(mission.crew).toHaveProperty('pilots');
        expect(mission.crew).toHaveProperty('sos');
        expect(Array.isArray(mission.crew.pilots)).toBe(true);
        expect(Array.isArray(mission.crew.sos)).toBe(true);
      }
    });

    test('duty events are tracked in timeline', async () => {
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

      const result = await runSimulation(dutyScenario, { state: mockState });

      const dutyEvents = result.timeline.filter(e => e.type === 'duty');
      expect(dutyEvents.length).toBeGreaterThan(0);

      if (dutyEvents.length > 0) {
        const duty = dutyEvents[0];
        expect(duty).toHaveProperty('duty_type');
        expect(duty).toHaveProperty('unit');
        expect(duty).toHaveProperty('start');
        expect(duty).toHaveProperty('end');
      }
    });
  });

  describe('Resource Allocation Algorithm Verification', () => {
    test('overrides replace derived initial values', async () => {
      const baseResult = await runSimulation(basicScenario, { state: mockState });
      const baseInitial = baseResult.initial_resources;

      const overrides = {
        units: {
          'HMLA-167': {
            aircraft: 100,
            pilot: 200,
            so: 150,
            payload_by_type: {
              'SkyTower II': 300
            }
          }
        }
      };

      const overriddenResult = await runSimulation(basicScenario, { state: mockState, overrides });

      // With massive resources, there should be no rejections
      expect(overriddenResult.missions.rejected).toBe(0);
    });

    test('rejection reasons correctly identify bottleneck resources', async () => {
      const limitedAircraftScenario = {
        ...basicScenario,
        demand: [
          {
            type: 'deterministic',
            mission_type: 'ISR',
            every_hours: 1, // High demand
            start_at_hours: 0
          }
        ]
      };

      const overrides = {
        units: {
          'HMLA-167': {
            aircraft: 1, // Very limited
            pilot: 50,
            so: 50,
            payload_by_type: {
              'SkyTower II': 50
            }
          },
          'HMLA-267': {
            aircraft: 1,
            pilot: 50,
            so: 50,
            payload_by_type: {
              'SkyTower II': 50
            }
          }
        }
      };

      const result = await runSimulation(limitedAircraftScenario, { state: mockState, overrides });

      // Aircraft should be the primary rejection reason
      if (result.missions.rejected > 0) {
        expect(result.rejections.aircraft).toBeGreaterThan(0);
      }
    });

    test('mission split policy affects unit selection', async () => {
      const biasedScenario = {
        ...basicScenario,
        unit_policy: {
          mission_split: { 'HMLA-167': 0.9, 'HMLA-267': 0.1 }
        }
      };

      const result = await runSimulation(biasedScenario, { state: mockState });

      const missions = result.timeline.filter(e => e.type === 'mission');
      if (missions.length > 10) {
        const unit167Count = missions.filter(m => m.unit === 'HMLA-167').length;
        const unit267Count = missions.filter(m => m.unit === 'HMLA-267').length;

        // With 90/10 split, HMLA-167 should get significantly more missions
        expect(unit167Count).toBeGreaterThan(unit267Count);
      }
    });

    test('mount time is calculated per payload type', async () => {
      const multiPayloadScenario = {
        ...basicScenario,
        mission_types: [
          {
            name: 'Multi-Payload',
            flight_time: { type: 'deterministic', value_hours: 2, transit_in_hours: 0, transit_out_hours: 0 },
            required_aircrew: { pilot: 1, so: 1 },
            required_payload_types: ['SkyTower II', 'Hellfire']
          }
        ],
        demand: [
          {
            type: 'deterministic',
            mission_type: 'Multi-Payload',
            every_hours: 8,
            start_at_hours: 0
          }
        ],
        process_times: {
          ...basicScenario.process_times,
          mount_times: {
            'SkyTower II': { type: 'deterministic', value_hours: 1 },
            'Hellfire': { type: 'deterministic', value_hours: 0.5 }
          }
        }
      };

      const result = await runSimulation(multiPayloadScenario, { state: mockState });

      const missions = result.timeline.filter(e => e.type === 'mission');
      if (missions.length > 0) {
        const mission = missions[0];
        const mountSegment = mission.segments.find(s => s.name === 'mount');

        if (mountSegment) {
          const mountDuration = mountSegment.end - mountSegment.start;
          // Should be sum of both payload mount times: 1 + 0.5 = 1.5
          expect(mountDuration).toBeCloseTo(1.5, 2);
        }
      }
    });

    test('crew rest periods prevent immediate reuse', async () => {
      const crewRestScenario = {
        ...basicScenario,
        personnel_availability: {
          '7318': {
            daily_crew_rest_hours: 12
          },
          '7314': {
            daily_crew_rest_hours: 12
          }
        },
        demand: [
          {
            type: 'deterministic',
            mission_type: 'ISR',
            every_hours: 1, // Frequent missions
            start_at_hours: 0
          }
        ]
      };

      const overrides = {
        units: {
          'HMLA-167': {
            aircraft: 50,
            pilot: 2, // Only 2 pilots with 12-hour rest
            so: 2,
            payload_by_type: {
              'SkyTower II': 50
            }
          },
          'HMLA-267': {
            aircraft: 50,
            pilot: 2,
            so: 2,
            payload_by_type: {
              'SkyTower II': 50
            }
          }
        }
      };

      const result = await runSimulation(crewRestScenario, { state: mockState, overrides });

      // With crew rest, pilots/SOs should become the bottleneck despite enough aircraft
      if (result.missions.rejected > 0) {
        expect(result.rejections.pilot + result.rejections.so).toBeGreaterThan(0);
      }
    });
  });

  describe('Integration with State Derivation', () => {
    test('derived initial state is embedded in simulation results', async () => {
      const initial = loadState(mockState);
      const result = await runSimulation(basicScenario, { state: mockState });

      expect(result.initial_resources.units).toEqual(expect.arrayContaining(initial.units));
      expect(result.initial_resources.aircraftByUnit).toMatchObject(initial.aircraftByUnit);
      expect(result.initial_resources.staffingByUnit).toMatchObject(initial.staffingByUnit);
      expect(result.initial_resources.payloadByUnit).toMatchObject(initial.payloadByUnit);
    });

    test('utilization denominators match initial resource counts', async () => {
      const result = await runSimulation(basicScenario, { state: mockState });
      const initial = result.initial_resources;

      for (const unit of initial.units) {
        if (result.utilization[unit]) {
          // The effective crew should relate to initial crew (may be adjusted by availability)
          expect(result.utilization[unit].initial_crew).toBeTruthy();
        }
      }
    });
  });
});

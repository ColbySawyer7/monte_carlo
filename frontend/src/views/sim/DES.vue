<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { ref, onMounted, computed, watch } from 'vue'

import Timelines from '../../components/des/Timelines.vue'
import Scenario from '../../components/des/Scenario.vue'
import Config from '../../components/des/Config.vue'
import Overview from '../../components/des/Overview.vue'
import Results from '../../components/des/Results.vue'
import { loadState, type State } from '../../state'
import { API_SIM_RUN } from '../../constants'
import { DESconfigDefaults } from './DESconfigDefaults'

// Use shared DES config defaults for initial values
const {
  processTimes,
  simSettings,
  missionTypes,
  demand,
  dutyRequirements,
  personnelAvailability,
  currentConfig,
  resetToDefaults,
  hasLoadedScenario,
  saveToLocalStorage,
  loadFromLocalStorage,
  simulationResults,
  resultsScenarioName,
  resultsTimestamp,
  currentScenarioName
} = DESconfigDefaults()
const isRunning = ref(false)
const hasUnsavedChanges = ref(false)

// Store original override values from state API
const originalOverrides = ref({
  vmu1: {
    aircraft: 0,
    pilot: 0,
    so: 0,
    intel: 0,
    skyTower: 0,
    ewPod: 0,
    smartSensor: 0,
    extendedRange: 0
  },
  vmu3: {
    aircraft: 0,
    pilot: 0,
    so: 0,
    intel: 0,
    skyTower: 0,
    ewPod: 0,
    smartSensor: 0,
    extendedRange: 0
  }
})

// Store staffing counts per unit from state
const baseStaffing = ref({
  vmu1: { pilot: 0, so: 0, intel: 0 },
  vmu3: { pilot: 0, so: 0, intel: 0 }
})

// Computed staffing that respects override settings
const staffing = computed(() => {
  if (simSettings.value.enableOverrides) {
    return {
      vmu1: {
        pilot: simSettings.value.overrides.vmu1.pilot,
        so: simSettings.value.overrides.vmu1.so,
        intel: simSettings.value.overrides.vmu1.intel
      },
      vmu3: {
        pilot: simSettings.value.overrides.vmu3.pilot,
        so: simSettings.value.overrides.vmu3.so,
        intel: simSettings.value.overrides.vmu3.intel
      }
    }
  }
  return baseStaffing.value
})

// Computed list of mission type names for the demand component
const availableMissionTypes = computed(() => {
  return missionTypes.value.map(mt => mt.name).filter(Boolean)
})

// Handler for when mission types change (name changes or removals)
function handleMissionTypesChanged() {
  const validMissionTypes = new Set(availableMissionTypes.value)

  // Filter out demand entries that reference mission types that no longer exist
  demand.value = demand.value.filter(d =>
    validMissionTypes.has(d.missionType)
  )
}

// Transform timeline data from backend format to component format
const transformedTimeline = computed(() => {
  if (!simulationResults.value?.timeline) return []

  const events: any[] = []
  let missionId = 0

  for (const item of simulationResults.value.timeline) {
    if (item.type === 'mission' && item.segments) {
      // Use backend mission_number if available, otherwise assign locally
      const currentMissionId = item.mission_number ?? missionId++

      // Flatten segments into individual events, but keep mission ID
      for (const segment of item.segments) {
        // Only add segment if it has non-zero duration
        if (segment.end > segment.start) {
          events.push({
            unit: item.unit,
            start: segment.start,
            end: segment.end,
            phase: segment.name,
            missionType: item.mission_type,
            missionId: currentMissionId
          })
        }
      }
    } else if (item.type === 'rejection') {
      // Add rejection event with reason
      events.push({
        unit: item.unit,
        start: item.time,
        end: item.time + 0.1, // Small duration for visibility
        phase: 'rejection',
        missionType: item.mission_type,
        rejectionReason: item.reason
      })
    }
  }

  return events
})

// Watch for enableOverrides changes to restore original values when disabled
watch(
  () => simSettings.value.enableOverrides,
  (newValue) => {
    if (!newValue) {
      // Restore original values when overrides are disabled
      simSettings.value.overrides.vmu1 = { ...originalOverrides.value.vmu1 }
      simSettings.value.overrides.vmu3 = { ...originalOverrides.value.vmu3 }
    }
  }
)

// Load override defaults from state API
async function loadOverrideDefaults() {
  try {
    const state: State = await loadState()
    if (!state?.tables) return

    const acRows = state.tables['v_aircraft']?.rows || []
    const staffRows = state.tables['v_staffing']?.rows || []
    const payloadRows = state.tables['v_unit_payload_readiness']?.rows || []

    // Count aircraft by unit (FMC only)
    function aircraftCount(unit: string): number {
      let count = 0
      for (const row of acRows) {
        if ((row['Unit'] || row['Unit Name']) === unit && row['Status'] === 'FMC') {
          count++
        }
      }
      return count
    }

    // Count crew by unit and MOS
    function crewCounts(unit: string): { pilot: number; so: number; intel: number } {
      let pilot = 0
      let so = 0
      let intel = 0
      for (const row of staffRows) {
        const u = row['Unit Name']
        const mos = row['MOS Number']
        if (u !== unit) continue
        if (mos === '7318') pilot++
        if (mos === '7314') so++
        if (mos === '0231') intel++
      }
      return { pilot, so, intel }
    }

    // Count payloads by unit and type
    function payloadCounts(unit: string) {
      const rows = payloadRows.filter((x) => x['Unit'] === unit)
      const out = { skyTower: 0, ewPod: 0, smartSensor: 0, extendedRange: 0 }
      for (const row of rows) {
        const type = row['Payload Type'] || row['Type']
        const count = Number(row['FMC Count'] || row['FMC'] || 0)
        if (type === 'SkyTower II') out.skyTower = count
        else if (type === 'EW Pod') out.ewPod = count
        else if (type === 'SmartSensor') out.smartSensor = count
        else if (type === 'Extended Range Tank') out.extendedRange = count
      }
      return out
    }

    const vmu1Data = {
      aircraft: aircraftCount('VMU-1'),
      ...crewCounts('VMU-1'),
      ...payloadCounts('VMU-1')
    }

    const vmu3Data = {
      aircraft: aircraftCount('VMU-3'),
      ...crewCounts('VMU-3'),
      ...payloadCounts('VMU-3')
    }

    // Calculate staffing per unit
    const vmu1Crew = crewCounts('VMU-1')
    const vmu3Crew = crewCounts('VMU-3')
    baseStaffing.value = {
      vmu1: { pilot: vmu1Crew.pilot, so: vmu1Crew.so, intel: vmu1Crew.intel },
      vmu3: { pilot: vmu3Crew.pilot, so: vmu3Crew.so, intel: vmu3Crew.intel }
    }

    // Store original values
    originalOverrides.value.vmu1 = { ...vmu1Data }
    originalOverrides.value.vmu3 = { ...vmu3Data }

    // Update override defaults
    simSettings.value.overrides.vmu1 = vmu1Data
    simSettings.value.overrides.vmu3 = vmu3Data
  } catch (error) {
    console.error('Failed to load override defaults from state:', error)
  }
}

// Scenario Handlers
function handleScenarioLoaded(content: any, scenarioId?: string) {
  currentScenarioName.value = content.name || 'Loaded Scenario'
  hasLoadedScenario.value = true  // Mark that a scenario has been loaded

  // Check if scenario has saved simSettings (from custom scenarios)
  if (content.simSettings) {
    // Restore enableOverrides setting from saved scenario
    simSettings.value.enableOverrides = content.simSettings.enableOverrides ?? false

    // Restore override values if present
    if (content.simSettings.overrides) {
      simSettings.value.overrides = {
        vmu1: { ...simSettings.value.overrides.vmu1, ...content.simSettings.overrides.vmu1 },
        vmu3: { ...simSettings.value.overrides.vmu3, ...content.simSettings.overrides.vmu3 }
      }
    }
  } else {
    // Disable resource overrides when loading prebuilt scenarios from API
    simSettings.value.enableOverrides = false
  }

  // Populate process times
  if (content.process_times) {
    const pt = content.process_times
    if (pt.preflight?.value_hours !== undefined) {
      processTimes.value.preflight = pt.preflight.value_hours
    }
    if (pt.postflight?.value_hours !== undefined) {
      processTimes.value.postflight = pt.postflight.value_hours
    }
    if (pt.turnaround?.value_hours !== undefined) {
      processTimes.value.turnaround = pt.turnaround.value_hours
    }
    if (pt.hold_crew_during_process_times !== undefined) {
      processTimes.value.hold_crew_during_process_times = pt.hold_crew_during_process_times
    }

    // Reset all mount times to 0 first, then apply scenario values
    processTimes.value.mountTimes = {
      'SkyTower II': 0,
      'EW Pod': 0,
      'SmartSensor': 0,
      'Extended Range Tank': 0
    }

    if (pt.mount_times) {
      Object.entries(pt.mount_times).forEach(([key, value]: [string, any]) => {
        if (value?.value_hours !== undefined) {
          processTimes.value.mountTimes[key as keyof typeof processTimes.value.mountTimes] = value.value_hours
        }
      })
    }
  }

  // Populate sim settings
  if (content.horizon_hours !== undefined) {
    simSettings.value.horizonHours = content.horizon_hours
  }
  if (content.constraints?.queueing) {
    simSettings.value.queueing = content.constraints.queueing
  }
  if (content.unit_policy?.mission_split) {
    const split = content.unit_policy.mission_split
    simSettings.value.unitSplit.vmu1 = Math.round((split['VMU-1'] || 0) * 100)
    simSettings.value.unitSplit.vmu3 = Math.round((split['VMU-3'] || 0) * 100)
  }

  // Populate mission types
  if (content.mission_types && Array.isArray(content.mission_types)) {
    missionTypes.value = content.mission_types.map((mt: any) => {
      // Parse flight time based on type
      let flightTime
      if (mt.flight_time?.type === 'deterministic') {
        flightTime = {
          type: 'deterministic' as const,
          value: mt.flight_time.value_hours || 0,
          transit_in: mt.flight_time.transit_in_hours || 0,
          transit_out: mt.flight_time.transit_out_hours || 0
        }
      } else {
        // Default to triangular
        flightTime = {
          type: 'triangular' as const,
          a: mt.flight_time?.a || 2,
          m: mt.flight_time?.m || 3,
          b: mt.flight_time?.b || 4,
          transit_in: mt.flight_time.transit_in_hours || 0,
          transit_out: mt.flight_time.transit_out_hours || 0
        }
      }

      return {
        name: mt.name || 'Mission',
        priority: mt.priority || 1,
        pilotReq: mt.required_aircrew?.pilot || 1,
        soReq: mt.required_aircrew?.so || 1,
        intelReq: mt.required_aircrew?.intel || 0,
        requiredPayloads: mt.required_payload_types || [],
        flightTime,
        crew_rotation: mt.crew_rotation ? {
          enabled: mt.crew_rotation.enabled || false,
          pilot_shifts: mt.crew_rotation.pilot_shifts || [],
          so_shifts: mt.crew_rotation.so_shifts || [],
          intel_shifts: mt.crew_rotation.intel_shifts || []
        } : undefined
      }
    })
  }

  // Populate demand
  if (content.demand && Array.isArray(content.demand)) {
    demand.value = content.demand.map((d: any) => {
      if (d.type === 'deterministic') {
        return {
          missionType: d.mission_type || 'MIR',
          type: 'deterministic' as const,
          everyHours: d.every_hours || 1,
          startAtHours: d.start_at_hours || 0
        }
      } else {
        return {
          missionType: d.mission_type || 'MIR',
          type: 'poisson' as const,
          ratePerHour: d.rate_per_hour || 1
        }
      }
    })
  }

  // Reset Duty Requirements to defaults, then apply scenario values if present
  dutyRequirements.value = {
    odo: {
      enabled: true,
      shifts_per_day: 3,
      hours_per_shift: 8,
      start_hour: 8,
      requires_pilot: 1,
      requires_so: 0,
      requires_intel: 0,
      duty_recovery_hours: 0,
      respect_work_schedule: false
    },
    sdo: {
      enabled: true,
      shifts_per_day: 1,
      hours_per_shift: 24,
      start_hour: 8,
      requires_pilot: 1,
      requires_so: 0,
      requires_intel: 0,
      duty_recovery_hours: 24,
      respect_work_schedule: false
    },
    sdnco: {
      enabled: true,
      shifts_per_day: 1,
      hours_per_shift: 24,
      start_hour: 8,
      requires_pilot: 0,
      requires_so: 1,
      requires_intel: 1,
      duty_recovery_hours: 24,
      respect_work_schedule: false
    },
    lookahead: {
      enabled: true,
      hours: 72
    }
  }

  // Populate duty requirements if present in scenario
  if (content.duty_requirements) {
    const dr = content.duty_requirements
    if (dr.odo) {
      dutyRequirements.value.odo = {
        enabled: dr.odo.enabled ?? true,
        shifts_per_day: dr.odo.shifts_per_day ?? 3,
        hours_per_shift: dr.odo.hours_per_shift ?? 8,
        start_hour: dr.odo.start_hour ?? 8,
        requires_pilot: dr.odo.requires_pilot ?? 1,
        requires_so: dr.odo.requires_so ?? 0,
        requires_intel: dr.odo.requires_intel ?? 0,
        duty_recovery_hours: dr.odo.duty_recovery_hours ?? 0,
        respect_work_schedule: dr.odo.respect_work_schedule ?? false
      }
    }
    if (dr.sdo) {
      dutyRequirements.value.sdo = {
        enabled: dr.sdo.enabled ?? true,
        shifts_per_day: dr.sdo.shifts_per_day ?? 1,
        hours_per_shift: dr.sdo.hours_per_shift ?? 24,
        start_hour: dr.sdo.start_hour ?? 8,
        requires_pilot: dr.sdo.requires_pilot ?? 1,
        requires_so: dr.sdo.requires_so ?? 0,
        requires_intel: dr.sdo.requires_intel ?? 0,
        duty_recovery_hours: dr.sdo.duty_recovery_hours ?? 24,
        respect_work_schedule: dr.sdo.respect_work_schedule ?? false
      }
    }
    if (dr.sdnco) {
      dutyRequirements.value.sdnco = {
        enabled: dr.sdnco.enabled ?? true,
        shifts_per_day: dr.sdnco.shifts_per_day ?? 1,
        hours_per_shift: dr.sdnco.hours_per_shift ?? 24,
        start_hour: dr.sdnco.start_hour ?? 8,
        requires_pilot: dr.sdnco.requires_pilot ?? 0,
        requires_so: dr.sdnco.requires_so ?? 1,
        requires_intel: dr.sdnco.requires_intel ?? 1,
        duty_recovery_hours: dr.sdnco.duty_recovery_hours ?? 24,
        respect_work_schedule: dr.sdnco.respect_work_schedule ?? false
      }
    }
    // Load lookahead configuration if present
    if (dr.lookahead) {
      dutyRequirements.value.lookahead = {
        enabled: dr.lookahead.enabled ?? true,
        hours: dr.lookahead.hours ?? 72
      }
    }
  }

  // Reset Personnel Availability to defaults, then apply scenario values if present
  personnelAvailability.value = {
    '7318': {
      work_schedule: {
        days_on: 5,
        days_off: 2,
        daily_start_hour: 8,
        shift_split_enabled: false,
        shift_split_percent: 50,
        stagger_days_off: 0
      },
      leave_days_annual: 30,
      range_days_annual: 3,
      safety_standdown_days_quarterly: 1,
      medical_days_monthly: 1,
      training_days_monthly: 1,
      daily_crew_rest_hours: 14
    },
    '7314': {
      work_schedule: {
        days_on: 5,
        days_off: 2,
        daily_start_hour: 8,
        shift_split_enabled: false,
        shift_split_percent: 50,
        stagger_days_off: 0
      },
      leave_days_annual: 30,
      range_days_annual: 14,
      safety_standdown_days_quarterly: 1,
      medical_days_monthly: 1,
      training_days_monthly: 1,
      daily_crew_rest_hours: 14
    },
    '0231': {
      work_schedule: {
        days_on: 5,
        days_off: 2,
        daily_start_hour: 8,
        shift_split_enabled: false,
        shift_split_percent: 50,
        stagger_days_off: 0
      },
      leave_days_annual: 30,
      range_days_annual: 5,
      safety_standdown_days_quarterly: 1,
      medical_days_monthly: 1,
      training_days_monthly: 1,
      daily_crew_rest_hours: 14
    }
  }

  // Populate personnel availability if present in scenario
  if (content.personnel_availability) {
    const pa = content.personnel_availability
    if (pa['7318']) {
      const pilot = pa['7318']
      personnelAvailability.value['7318'] = {
        work_schedule: {
          days_on: pilot.work_schedule?.days_on ?? 5,
          days_off: pilot.work_schedule?.days_off ?? 2,
          daily_start_hour: pilot.work_schedule?.daily_start_hour ?? 8,
          shift_split_enabled: pilot.work_schedule?.shift_split_enabled ?? false,
          shift_split_percent: pilot.work_schedule?.shift_split_percent ?? 50,
          stagger_days_off: pilot.work_schedule?.stagger_days_off ?? 0
        },
        leave_days_annual: pilot.leave_days_annual ?? 30,
        range_days_annual: pilot.range_days_annual ?? 3,
        safety_standdown_days_quarterly: pilot.safety_standdown_days_quarterly ?? 1,
        medical_days_monthly: pilot.medical_days_monthly ?? 1,
        training_days_monthly: pilot.training_days_monthly ?? 1,
        daily_crew_rest_hours: pilot.daily_crew_rest_hours ?? 14
      }
    }
    if (pa['7314']) {
      const so = pa['7314']
      personnelAvailability.value['7314'] = {
        work_schedule: {
          days_on: so.work_schedule?.days_on ?? 5,
          days_off: so.work_schedule?.days_off ?? 2,
          daily_start_hour: so.work_schedule?.daily_start_hour ?? 8,
          shift_split_enabled: so.work_schedule?.shift_split_enabled ?? false,
          shift_split_percent: so.work_schedule?.shift_split_percent ?? 50,
          stagger_days_off: so.work_schedule?.stagger_days_off ?? 0
        },
        leave_days_annual: so.leave_days_annual ?? 30,
        range_days_annual: so.range_days_annual ?? 14,
        safety_standdown_days_quarterly: so.safety_standdown_days_quarterly ?? 1,
        medical_days_monthly: so.medical_days_monthly ?? 1,
        training_days_monthly: so.training_days_monthly ?? 1,
        daily_crew_rest_hours: so.daily_crew_rest_hours ?? 14
      }
    }
    if (pa['0231']) {
      const intel = pa['0231']
      personnelAvailability.value['0231'] = {
        work_schedule: {
          days_on: intel.work_schedule?.days_on ?? 5,
          days_off: intel.work_schedule?.days_off ?? 2,
          daily_start_hour: intel.work_schedule?.daily_start_hour ?? 8,
          shift_split_enabled: intel.work_schedule?.shift_split_enabled ?? false,
          shift_split_percent: intel.work_schedule?.shift_split_percent ?? 50,
          stagger_days_off: intel.work_schedule?.stagger_days_off ?? 0
        },
        leave_days_annual: intel.leave_days_annual ?? 30,
        range_days_annual: intel.range_days_annual ?? 5,
        safety_standdown_days_quarterly: intel.safety_standdown_days_quarterly ?? 1,
        medical_days_monthly: intel.medical_days_monthly ?? 1,
        training_days_monthly: intel.training_days_monthly ?? 1,
        daily_crew_rest_hours: intel.daily_crew_rest_hours ?? 14
      }
    }
  }

  // Save to localStorage after loading scenario
  saveToLocalStorage(scenarioId)
}

function handleNewScenario() {
  currentScenarioName.value = 'New Scenario'
  hasLoadedScenario.value = true  // Mark that user intentionally created new scenario

  // Reset to defaults from composable
  resetToDefaults()

  // Clear results
  simulationResults.value = null
  resultsScenarioName.value = ''

  // Disable resource overrides
  simSettings.value.enableOverrides = false

  // Save to localStorage after creating new scenario (no scenario ID)
  saveToLocalStorage(undefined)
}

async function handleRunScenario() {
  // Save current scroll position
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  isRunning.value = true
  simulationResults.value = null

  try {
    // Load current state
    const state = await loadState()

    // Build scenario payload
    const scenario = {
      name: currentScenarioName.value,
      horizon_hours: simSettings.value.horizonHours,
      constraints: {
        queueing: simSettings.value.queueing
      },
      unit_policy: {
        assignment: 'by_unit',
        mission_split: {
          'VMU-1': simSettings.value.unitSplit.vmu1 / 100,
          'VMU-3': simSettings.value.unitSplit.vmu3 / 100
        }
      },
      demand: demand.value.map(d => {
        if (d.type === 'deterministic') {
          return {
            mission_type: d.missionType,
            type: 'deterministic',
            every_hours: d.everyHours,
            start_at_hours: d.startAtHours
          }
        } else {
          return {
            mission_type: d.missionType,
            type: 'poisson',
            rate_per_hour: d.ratePerHour
          }
        }
      }),
      mission_types: missionTypes.value.map(mt => ({
        name: mt.name,
        priority: mt.priority,
        required_aircrew: {
          pilot: mt.pilotReq,
          so: mt.soReq,
          intel: mt.intelReq
        },
        required_payload_types: mt.requiredPayloads,
        flight_time: mt.flightTime.type === 'deterministic'
          ? {
            type: 'deterministic',
            value_hours: mt.flightTime.value,
            transit_in_hours: mt.flightTime.transit_in || 0,
            transit_out_hours: mt.flightTime.transit_out || 0
          }
          : {
            type: 'triangular',
            a: mt.flightTime.a,
            m: mt.flightTime.m,
            b: mt.flightTime.b,
            transit_in_hours: mt.flightTime.transit_in || 0,
            transit_out_hours: mt.flightTime.transit_out || 0
          },
        crew_distribution: mt.crew_distribution || 'concentrate',
        ...(mt.crew_rotation?.enabled && {
          crew_rotation: {
            enabled: true,
            pilot_shifts: mt.crew_rotation.pilot_shifts || [],
            so_shifts: mt.crew_rotation.so_shifts || [],
            intel_shifts: mt.crew_rotation.intel_shifts || []
          }
        })
      })),
      process_times: {
        preflight: { value_hours: processTimes.value.preflight },
        postflight: { value_hours: processTimes.value.postflight },
        turnaround: { value_hours: processTimes.value.turnaround },
        hold_crew_during_process_times: processTimes.value.hold_crew_during_process_times,
        mount_times: Object.fromEntries(
          Object.entries(processTimes.value.mountTimes).map(([key, value]) => [
            key,
            { value_hours: value }
          ])
        )
      },
      // Include duty requirements and personnel availability (always sent, engine uses if present)
      duty_requirements: dutyRequirements.value,
      personnel_availability: personnelAvailability.value
    }

    // Build overrides if enabled
    let overrides = null
    if (simSettings.value.enableOverrides) {
      overrides = {
        units: {
          'VMU-1': {
            aircraft: simSettings.value.overrides.vmu1.aircraft,
            pilot: simSettings.value.overrides.vmu1.pilot,
            so: simSettings.value.overrides.vmu1.so,
            intel: simSettings.value.overrides.vmu1.intel,
            payload_by_type: {
              'SkyTower II': simSettings.value.overrides.vmu1.skyTower,
              'EW Pod': simSettings.value.overrides.vmu1.ewPod,
              'SmartSensor': simSettings.value.overrides.vmu1.smartSensor,
              'Extended Range Tank': simSettings.value.overrides.vmu1.extendedRange
            }
          },
          'VMU-3': {
            aircraft: simSettings.value.overrides.vmu3.aircraft,
            pilot: simSettings.value.overrides.vmu3.pilot,
            so: simSettings.value.overrides.vmu3.so,
            intel: simSettings.value.overrides.vmu3.intel,
            payload_by_type: {
              'SkyTower II': simSettings.value.overrides.vmu3.skyTower,
              'EW Pod': simSettings.value.overrides.vmu3.ewPod,
              'SmartSensor': simSettings.value.overrides.vmu3.smartSensor,
              'Extended Range Tank': simSettings.value.overrides.vmu3.extendedRange
            }
          }
        }
      }
    }

    // POST to /api/sim/run
    const response = await fetch(API_SIM_RUN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, state, overrides })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || response.statusText)
    }

    const data = await response.json()
    simulationResults.value = data.results
    resultsScenarioName.value = currentScenarioName.value
    resultsTimestamp.value = new Date().toLocaleString()

    // Save results to localStorage (pass current scenario name to preserve it)
    saveToLocalStorage(currentScenarioName.value)

    // Restore scroll position after next render
    await new Promise(resolve => setTimeout(resolve, 0))
    window.scrollTo(scrollX, scrollY)
  } catch (error) {
    console.error('Failed to run scenario:', error)
    alert(`Failed to run scenario: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    isRunning.value = false

    // Ensure scroll position is maintained after isRunning changes
    await new Promise(resolve => setTimeout(resolve, 0))
    window.scrollTo(scrollX, scrollY)
  }
}

onMounted(() => {
  loadOverrideDefaults()

  // Try to load from localStorage first
  const result = loadFromLocalStorage()

  // Only initialize with defaults if nothing was saved in localStorage
  if (!result.success) {
    handleNewScenario()
  }
  // Note: Scenario component will restore selection via its own localStorage check
})
</script>

<template>
  <div class="des-container">
    <!-- Page Header -->
    <div class="section-header">
      <div class="header-row">
        <div>
          <h2>DISCRETE EVENT SIMULATION</h2>
          <p class="section-desc">
            Purpose: simulate workflows as discrete events and resource states over time to evaluate throughput, waits,
            and
            utilization.<br>
            Benefits: captures queues, routing, and resource contention; supports detailed what-if scenarios and
            scheduling
            policies.<br>
            Best use: operations with constrained resources and process logic (maintenance, sortie generation,
            turnaround),
            where you need bottleneck analysis and service-level estimates.
          </p>
        </div>
      </div>
    </div>

    <!-- Visualization Tabs -->
    <Timelines :timeline="transformedTimeline" :raw-timeline="simulationResults?.timeline"
      :availability-timeline="simulationResults?.availability_timeline" :horizon-hours="simSettings.horizonHours"
      :unit-split="simSettings.unitSplit" :personnel-availability="personnelAvailability"
      :initial-resources="simulationResults?.initial_resources" :utilization="simulationResults?.utilization" />

    <!-- Main Layout: Left (Scenario) + Right (Overview and Results) -->
    <div class="des-layout">
      <!-- Left Section: Scenario Editor -->
      <div class="scenario-section">
        <!-- Scenario Section -->
        <div class="section-card">
          <Scenario :current-config="currentConfig" :has-unsaved-changes="hasUnsavedChanges"
            @scenario-loaded="handleScenarioLoaded" @new-scenario="handleNewScenario" @run-scenario="handleRunScenario"
            @update:has-unsaved-changes="hasUnsavedChanges = $event" />
        </div>

        <!-- Scenario Configuration Section -->
        <div class="section-card config-card">
          <Config :process-times="processTimes" @update:process-times="processTimes = $event"
            :sim-settings="simSettings" @update:sim-settings="(val) => simSettings = {
              ...val,
              overrides: {
                vmu1: { ...val.overrides.vmu1, intel: val.overrides.vmu1.intel ?? 0 },
                vmu3: { ...val.overrides.vmu3, intel: val.overrides.vmu3.intel ?? 0 }
              }
            }" :mission-types="missionTypes" @update:mission-types="(val) => missionTypes = val.map(mt => ({
              ...mt,
              intelReq: mt.intelReq ?? 0,
              crew_rotation: mt.crew_rotation ? {
                ...mt.crew_rotation,
                intel_shifts: mt.crew_rotation.intel_shifts ?? []
              } : undefined
            }))" @mission-types-changed="handleMissionTypesChanged" :demand="demand" @update:demand="demand = $event"
            :duty-requirements="dutyRequirements" @update:duty-requirements="(val) => dutyRequirements = {
              odo: { ...val.odo, requires_intel: val.odo.requires_intel ?? 0, duty_recovery_hours: val.odo.duty_recovery_hours ?? 0, respect_work_schedule: val.odo.respect_work_schedule ?? false },
              sdo: { ...val.sdo, requires_intel: val.sdo.requires_intel ?? 0, duty_recovery_hours: val.sdo.duty_recovery_hours ?? 24, respect_work_schedule: val.sdo.respect_work_schedule ?? false },
              sdnco: { ...val.sdnco, requires_intel: val.sdnco.requires_intel ?? 0, duty_recovery_hours: val.sdnco.duty_recovery_hours ?? 24, respect_work_schedule: val.sdnco.respect_work_schedule ?? false },
              lookahead: val.lookahead ?? { enabled: true, hours: 72 }
            }" :availability-factors="personnelAvailability"
            @update:availability-factors="personnelAvailability = $event"
            :available-mission-types="availableMissionTypes" :staffing="staffing" />
        </div>
      </div>

      <!-- Right Section: Config Overview and Results -->
      <div class="overview-section">
        <div class="section-card">
          <Overview :unit-split="simSettings.unitSplit" :queueing="simSettings.queueing" :mission-types="missionTypes"
            :demand="demand" :process-times="processTimes" :horizon-hours="simSettings.horizonHours"
            :results="resultsScenarioName === currentScenarioName ? simulationResults : null" />
        </div>

        <div class="section-card results-card">
          <Results :results="simulationResults" :scenario-name="resultsScenarioName" :is-running="isRunning" />
        </div>
      </div>
    </div>
  </div>
</template>


<style scoped>
.des-container {
  padding: 20px;
  scroll-behavior: auto;
}

.section-header {
  margin-bottom: 24px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
}

.section-header h2 {
  margin: 0 0 8px 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-color);
}

h3 {
  display: flex;
  align-items: center;
  gap: 12px;
}

.unsaved-changes-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid #f59e0b;
  border-radius: 4px;
  font-size: 0.7rem;
  color: #f59e0b;
  font-weight: 600;
}

.unsaved-changes-badge svg {
  flex-shrink: 0;
}

.section-desc {
  margin: 0;
  color: var(--text-muted-color);
  font-size: 0.9rem;
  line-height: 1.5;
}

.mode-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 280px;
  padding: 12px;
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid var(--accent-blue);
  border-radius: 8px;
}

.mode-selector label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
}

.mode-select {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.mode-select:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.mode-description {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  margin: 0;
  font-style: italic;
}

.des-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  grid-auto-rows: auto;
}

.scenario-section,
.overview-section {
  display: contents;
}

.section-card {
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: 16px;
  max-width: 100%;
}

.section-card:first-child {
  grid-row: 1;
}

/* Top left card - first in scenario-section */
.scenario-section .section-card:nth-of-type(1) {
  border-top-left-radius: 8px;
}

/* Top right card - first in overview-section */
.overview-section .section-card:nth-of-type(1) {
  border-top-right-radius: 8px;
}

/* Bottom left card - second in scenario-section */
.scenario-section .section-card:nth-of-type(2) {
  border-bottom-left-radius: 8px;
}

/* Bottom right card - second in overview-section */
.overview-section .section-card:nth-of-type(2) {
  border-bottom-right-radius: 8px;
}

.section-card h3 {
  margin: 0 0 16px 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.config-card {
  margin-top: 0;
  overflow-x: hidden;
}

.results-card {
  margin-top: 0;
}

@media (max-width: 1200px) {
  .des-layout {
    grid-template-columns: 1fr;
  }
}
</style>

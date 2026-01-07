import { ref, computed } from 'vue'

// Shared DES configuration state
// This composable allows multiple components to access and modify the same DES config

interface ProcessTimesData {
  preflight: number
  postflight: number
  turnaround: number
  hold_crew_during_process_times?: boolean
  mountTimes: {
    'SkyTower II': number
    'EW Pod': number
    'SmartSensor': number
    'Extended Range Tank': number
  }
}

interface AvailabilityFactorsData {
  '7318': {
    work_schedule: {
      days_on: number
      days_off: number
      daily_start_hour: number
      shift_split_enabled: boolean
      shift_split_percent: number
      stagger_days_off: number
    }
    leave_days_annual: number
    range_days_annual: number
    safety_standdown_days_quarterly: number
    medical_days_monthly: number
    training_days_monthly: number
    daily_crew_rest_hours: number
  }
  '7314': {
    work_schedule: {
      days_on: number
      days_off: number
      daily_start_hour: number
      shift_split_enabled: boolean
      shift_split_percent: number
      stagger_days_off: number
    }
    leave_days_annual: number
    range_days_annual: number
    safety_standdown_days_quarterly: number
    medical_days_monthly: number
    training_days_monthly: number
    daily_crew_rest_hours: number
  }
  '0231': {
    work_schedule: {
      days_on: number
      days_off: number
      daily_start_hour: number
      shift_split_enabled: boolean
      shift_split_percent: number
      stagger_days_off: number
    }
    leave_days_annual: number
    range_days_annual: number
    safety_standdown_days_quarterly: number
    medical_days_monthly: number
    training_days_monthly: number
    daily_crew_rest_hours: number
  }
}

// Initial default values - defined once, used for both initialization and reset
const INITIAL_DEFAULTS = {
  processTimes: {
    preflight: 0.25,
    postflight: 0.25,
    turnaround: 0.25,
    hold_crew_during_process_times: false,
    mountTimes: {
      'SkyTower II': 0.25,
      'EW Pod': 0.25,
      'SmartSensor': 0.25,
      'Extended Range Tank': 0.25
    }
  },
  simSettings: {
    horizonHours: 24,
    queueing: 'reject_if_unavailable' as const,
    enableOverrides: false,
    algorithm: 'PERT' as const,
    overrides: {
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
    },
    unitSplit: {
      vmu1: 50,
      vmu3: 50
    }
  },
  dutyRequirements: {
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
  },
  personnelAvailability: {
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
}

// Process Times State - initialized from defaults
export const processTimes = ref<ProcessTimesData>(
  JSON.parse(JSON.stringify(INITIAL_DEFAULTS.processTimes))
)

// Simulation Settings State - initialized from defaults
export const simSettings = ref(
  JSON.parse(JSON.stringify(INITIAL_DEFAULTS.simSettings))
)

// Mission Types State - starts empty
export const missionTypes = ref<Array<{
  name: string
  priority: number
  pilotReq: number
  soReq: number
  intelReq: number
  requiredPayloads: string[]
  flightTime: {
    type: 'triangular'; a: number; m: number; b: number; transit_in?: number; transit_out?: number
  } | {
    type: 'deterministic'; value: number; transit_in?: number; transit_out?: number
  }
  crew_rotation?: {
    enabled: boolean
    pilot_shifts: number[]
    so_shifts: number[]
    intel_shifts: number[]
  }
  crew_distribution?: 'concentrate' | 'rotate' | 'random'
  transit_in?: number
  transit_out?: number
}>>([])

// Demand State - starts empty
export const demand = ref<Array<{
  missionType: string
  type: 'poisson' | 'deterministic'
  ratePerHour?: number
  everyHours?: number
  startAtHours?: number
}>>([])

// Duty Requirements State - initialized from defaults
export const dutyRequirements = ref(
  JSON.parse(JSON.stringify(INITIAL_DEFAULTS.dutyRequirements))
)

// Personnel Availability State - initialized from defaults
export const personnelAvailability = ref<AvailabilityFactorsData>(
  JSON.parse(JSON.stringify(INITIAL_DEFAULTS.personnelAvailability))
)

// Computed current configuration - aggregates all config pieces
export const currentConfig = computed(() => ({
  processTimes: processTimes.value,
  simSettings: simSettings.value,
  missionTypes: missionTypes.value,
  demand: demand.value,
  dutyRequirements: dutyRequirements.value,
  personnelAvailability: personnelAvailability.value
}))

// Reset to initial defaults
export function resetToDefaults() {
  // Reset mission types and demand to empty arrays
  missionTypes.value = []
  demand.value = []

  // Reset all values from INITIAL_DEFAULTS (single source of truth)
  processTimes.value = JSON.parse(JSON.stringify(INITIAL_DEFAULTS.processTimes))
  simSettings.value = JSON.parse(JSON.stringify(INITIAL_DEFAULTS.simSettings))
  dutyRequirements.value = JSON.parse(JSON.stringify(INITIAL_DEFAULTS.dutyRequirements))
  personnelAvailability.value = JSON.parse(JSON.stringify(INITIAL_DEFAULTS.personnelAvailability))
}

// Track if any scenario has been loaded (to prevent reset on tab navigation)
export const hasLoadedScenario = ref(false)

// Simulation results state
export const simulationResults = ref<any>(null)
export const resultsScenarioName = ref<string>('')
export const resultsTimestamp = ref<string>('')
export const currentScenarioName = ref<string>('New Scenario')

export function DESconfigDefaults() {
  return {
    processTimes,
    simSettings,
    missionTypes,
    demand,
    dutyRequirements,
    personnelAvailability,
    currentConfig,
    resetToDefaults,
    hasLoadedScenario,
    simulationResults,
    resultsScenarioName,
    resultsTimestamp,
    currentScenarioName
  }
}

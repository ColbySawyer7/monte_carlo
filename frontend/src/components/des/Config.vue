<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { ref } from 'vue'
import Settings from './config/Settings.vue'
import Operations from './config/Operations.vue'
import Personnel from './config/Personnel.vue'

interface Staffing {
  vmu1: { pilot: number; so: number; intel: number }
  vmu3: { pilot: number; so: number; intel: number }
}

const activeTab = ref<'settings' | 'operations' | 'personnel'>('settings')
const hasOperationsErrors = ref(false)

function handleOperationsValidation(hasErrors: boolean) {
  hasOperationsErrors.value = hasErrors
}

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

interface SimSettingsData {
  horizonHours: number
  queueing: string
  enableOverrides: boolean
  overrides: {
    vmu1: {
      aircraft: number
      pilot: number
      so: number
      intel: number
      skyTower: number
      ewPod: number
      smartSensor: number
      extendedRange: number
    }
    vmu3: {
      aircraft: number
      pilot: number
      so: number
      intel: number
      skyTower: number
      ewPod: number
      smartSensor: number
      extendedRange: number
    }
  }
  unitSplit: {
    vmu1: number
    vmu3: number
  }
}

interface MissionType {
  name: string
  priority: number
  pilotReq: number
  soReq: number
  intelReq: number
  requiredPayloads: string[]
  flightTime: { type: 'triangular'; a: number; m: number; b: number; transit_in?: number; transit_out?: number } | { type: 'deterministic'; value: number; transit_in?: number; transit_out?: number }
  crew_rotation?: {
    enabled: boolean
    pilot_shifts: number[]
    so_shifts: number[]
    intel_shifts: number[]
  }
}

interface DemandEntry {
  missionType: string
  type: 'poisson' | 'deterministic'
  ratePerHour?: number
  everyHours?: number
  startAtHours?: number
}

interface DutyRequirementsData {
  odo: {
    enabled: boolean
    shifts_per_day: number
    hours_per_shift: number
    start_hour: number
    requires_pilot: number
    requires_so: number
    requires_intel: number
    duty_recovery_hours?: number
    respect_work_schedule?: boolean
  }
  sdo: {
    enabled: boolean
    shifts_per_day: number
    hours_per_shift: number
    start_hour: number
    requires_pilot: number
    requires_so: number
    requires_intel: number
    duty_recovery_hours?: number
    respect_work_schedule?: boolean
  }
  sdnco: {
    enabled: boolean
    shifts_per_day: number
    hours_per_shift: number
    start_hour: number
    requires_pilot: number
    requires_so: number
    requires_intel: number
    duty_recovery_hours?: number
    respect_work_schedule?: boolean
  }
  lookahead?: {
    enabled: boolean
    hours: number
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

interface Props {
  processTimes: ProcessTimesData
  simSettings: SimSettingsData
  missionTypes: MissionType[]
  demand: DemandEntry[]
  dutyRequirements: DutyRequirementsData
  availabilityFactors: AvailabilityFactorsData
  availableMissionTypes: string[]
  staffing?: Staffing
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:processTimes': [value: ProcessTimesData]
  'update:simSettings': [value: SimSettingsData]
  'update:missionTypes': [value: MissionType[]]
  'update:demand': [value: DemandEntry[]]
  'update:dutyRequirements': [value: DutyRequirementsData]
  'update:availabilityFactors': [value: AvailabilityFactorsData]
  'mission-types-changed': []
}>()
</script>

<template>
  <div class="config">
    <div class="config-header">
      <h3>Scenario Configuration</h3>
    </div>
    <!-- Tab Navigation -->
    <div class="tab-navigation">
      <button :class="['tab-btn', { active: activeTab === 'settings' }]" @click="activeTab = 'settings'">
        Settings
      </button>
      <button :class="['tab-btn', { active: activeTab === 'operations', error: hasOperationsErrors }]"
        @click="activeTab = 'operations'">
        Operations
      </button>
      <button :class="['tab-btn', { active: activeTab === 'personnel' }]" @click="activeTab = 'personnel'">
        Personnel
      </button>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- Settings Tab -->
      <div v-show="activeTab === 'settings'" class="tab-panel">
        <Settings :process-times="processTimes" @update:process-times="emit('update:processTimes', $event)"
          :sim-settings="simSettings" @update:sim-settings="emit('update:simSettings', $event)" />
      </div>

      <!-- Operations Tab -->
      <div v-show="activeTab === 'operations'" class="tab-panel">
        <Operations :mission-types="missionTypes" @update:mission-types="emit('update:missionTypes', $event)"
          @mission-types-changed="emit('mission-types-changed')" :demand="demand"
          @update:demand="emit('update:demand', $event)" :available-mission-types="availableMissionTypes"
          :process-times="processTimes" @validation-changed="handleOperationsValidation" />
      </div>

      <!-- Personnel Tab -->
      <div v-show="activeTab === 'personnel'" class="tab-panel">
        <Personnel :duty-requirements="dutyRequirements"
          @update:duty-requirements="emit('update:dutyRequirements', $event)"
          :availability-factors="availabilityFactors"
          @update:availability-factors="emit('update:availabilityFactors', $event)" :staffing="props.staffing" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.config {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 100%;
  overflow-x: hidden;
}

.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.config-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
}

/* Tab Navigation */
.tab-navigation {
  display: flex;
  gap: 4px;
  margin-top: 0px;
  margin-bottom: -16px;
  border-bottom: 2px solid var(--border-color);
  position: static !important;
  z-index: 0;
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-muted-color);
  transition: all 0.2s ease;
  position: relative;
}

.tab-btn:hover {
  color: var(--text-color);
  background: rgba(59, 130, 246, 0.05);
}

.tab-btn.active {
  color: var(--accent-blue);
  border-bottom-color: var(--accent-blue);
  background: rgba(59, 130, 246, 0.08);
}

.tab-btn.error {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
}

.tab-btn.error:hover {
  background: rgba(239, 68, 68, 0.1);
}

.tab-btn.error.active {
  color: #ef4444;
  border-bottom-color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.tab-content {
  display: block;
  max-width: 100%;
  overflow-x: hidden;
}

.tab-panel {
  display: block;
  max-width: 100%;
  overflow-x: hidden;
}
</style>

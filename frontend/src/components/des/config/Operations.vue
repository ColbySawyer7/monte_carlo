<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { ref } from 'vue'
import MissionTypes from './operations/MissionTypes.vue'
import Demand from './operations/Demand.vue'

const hasValidationErrors = ref(false)

function handleValidationChanged(hasErrors: boolean) {
  hasValidationErrors.value = hasErrors
  emit('validation-changed', hasErrors)
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

interface ProcessTimes {
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

interface Props {
  missionTypes: MissionType[]
  demand: DemandEntry[]
  availableMissionTypes: string[]
  processTimes: ProcessTimes
}

defineProps<Props>()

const emit = defineEmits<{
  'update:missionTypes': [value: MissionType[]]
  'update:demand': [value: DemandEntry[]]
  'mission-types-changed': []
  'validation-changed': [hasErrors: boolean]
}>()
</script>

<template>
  <div class="operations-tab">
    <MissionTypes :model-value="missionTypes" @update:model-value="emit('update:missionTypes', $event)"
      @mission-types-changed="emit('mission-types-changed')" :staffing-mode="true" :process-times="processTimes"
      @validation-changed="handleValidationChanged" />
    <Demand :model-value="demand" @update:model-value="emit('update:demand', $event)"
      :available-mission-types="availableMissionTypes" />
  </div>
</template>

<style scoped>
.operations-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 100%;
  overflow-x: hidden;
}
</style>

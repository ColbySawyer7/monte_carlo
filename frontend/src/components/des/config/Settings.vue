<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import ProcessTimes from './settings/ProcessTimes.vue'
import SimSettings from './settings/SimSettings.vue'

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

interface Props {
  processTimes: ProcessTimesData
  simSettings: SimSettingsData
}

defineProps<Props>()

const emit = defineEmits<{
  'update:processTimes': [value: ProcessTimesData]
  'update:simSettings': [value: SimSettingsData]
}>()
</script>

<template>
  <div class="settings-tab">
    <ProcessTimes :model-value="processTimes" @update:model-value="emit('update:processTimes', $event)" />
    <SimSettings :model-value="simSettings" @update:model-value="emit('update:simSettings', $event)" />
  </div>
</template>

<style scoped>
.settings-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>

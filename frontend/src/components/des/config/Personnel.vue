<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { ref, watch } from 'vue'
import DutyRequirements from './personnel/DutyRequirements.vue'
import AvailabilityFactors from './personnel/AvailabilityFactors.vue'

const STORAGE_KEY = 'desPersonnelActiveTab'

const activeTab = ref<'duty' | 'availability'>(
  (localStorage.getItem(STORAGE_KEY) as any) || 'duty'
)

// Save active tab to localStorage whenever it changes
watch(activeTab, (newTab) => {
  localStorage.setItem(STORAGE_KEY, newTab)
})

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

interface Staffing {
  vmu1: { pilot: number; so: number; intel: number }
  vmu3: { pilot: number; so: number; intel: number }
}

interface Props {
  dutyRequirements: DutyRequirementsData
  availabilityFactors: AvailabilityFactorsData
  staffing?: Staffing
}

defineProps<Props>()

const emit = defineEmits<{
  'update:dutyRequirements': [value: DutyRequirementsData]
  'update:availabilityFactors': [value: AvailabilityFactorsData]
}>()
</script>

<template>
  <div class="personnel-tab">
    <!-- Tab Navigation -->
    <div class="tab-navigation">
      <button :class="['tab-btn', { active: activeTab === 'duty' }]" @click="activeTab = 'duty'">
        Duty Requirements
      </button>
      <button :class="['tab-btn', { active: activeTab === 'availability' }]" @click="activeTab = 'availability'">
        Availability Factors
      </button>
    </div>

    <!-- Duty Tab -->
    <div v-show="activeTab === 'duty'">
      <DutyRequirements :model-value="dutyRequirements" @update:model-value="emit('update:dutyRequirements', $event)" />
    </div>

    <!-- Availability Tab -->
    <div v-show="activeTab === 'availability'">
      <AvailabilityFactors :model-value="availabilityFactors"
        @update:model-value="emit('update:availabilityFactors', $event)" :staffing="staffing" />
    </div>
  </div>
</template>

<style scoped>
.personnel-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Tab Navigation */
.tab-navigation {
  display: flex;
  gap: 4px;
  margin-top: -16px;
  margin-bottom: 16px;
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
</style>

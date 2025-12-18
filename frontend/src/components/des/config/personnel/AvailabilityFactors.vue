<script setup lang="ts">
import { ref, computed } from 'vue'
import MosAvailability from './MosAvailability.vue'

interface WorkSchedule {
  days_on: number
  days_off: number
  daily_start_hour: number
  shift_split_enabled: boolean
  shift_split_percent: number
  stagger_days_off: number
}

interface AvailabilityFactors {
  '7318': {
    work_schedule: WorkSchedule
    leave_days_annual: number
    range_days_annual: number
    safety_standdown_days_quarterly: number
    medical_days_monthly: number
    training_days_monthly: number
    daily_crew_rest_hours: number
  }
  '7314': {
    work_schedule: WorkSchedule
    leave_days_annual: number
    range_days_annual: number
    safety_standdown_days_quarterly: number
    medical_days_monthly: number
    training_days_monthly: number
    daily_crew_rest_hours: number
  }
  '0231': {
    work_schedule: WorkSchedule
    leave_days_annual: number
    range_days_annual: number
    safety_standdown_days_quarterly: number
    medical_days_monthly: number
    training_days_monthly: number
    daily_crew_rest_hours: number
  }
}

interface Props {
  modelValue: AvailabilityFactors
  staffing?: {
    vmu1: { pilot: number; so: number; intel: number }
    vmu3: { pilot: number; so: number; intel: number }
  }
}

interface Emits {
  (e: 'update:modelValue', value: AvailabilityFactors): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const activeMOS = ref<'7318' | '7314' | '0231'>('7318')

type AvailabilityField =
  | 'leave_days_annual'
  | 'range_days_annual'
  | 'safety_standdown_days_quarterly'
  | 'medical_days_monthly'
  | 'training_days_monthly'
  | 'daily_crew_rest_hours'

type WorkScheduleField =
  | 'days_on'
  | 'days_off'
  | 'daily_start_hour'
  | 'shift_split_enabled'
  | 'shift_split_percent'
  | 'stagger_days_off'

function updateAvailability(mos: '7318' | '7314' | '0231', field: AvailabilityField | WorkScheduleField, value: any) {
  const updated = { ...props.modelValue }

  const workScheduleFields: WorkScheduleField[] = [
    'days_on',
    'days_off',
    'daily_start_hour',
    'shift_split_enabled',
    'shift_split_percent',
    'stagger_days_off'
  ]

  if (workScheduleFields.includes(field as WorkScheduleField)) {
    updated[mos] = {
      ...updated[mos],
      work_schedule: {
        ...updated[mos].work_schedule,
        [field]: value
      }
    } as any
  } else {
    updated[mos] = {
      ...updated[mos],
      [field]: value
    } as any
  }

  emit('update:modelValue', updated)
}

const pilotStaffing = computed(() => ({
  vmu1: props.staffing?.vmu1.pilot || 0,
  vmu3: props.staffing?.vmu3.pilot || 0
}))

const soStaffing = computed(() => ({
  vmu1: props.staffing?.vmu1.so || 0,
  vmu3: props.staffing?.vmu3.so || 0
}))

const intelStaffing = computed(() => ({
  vmu1: props.staffing?.vmu1.intel || 0,
  vmu3: props.staffing?.vmu3.intel || 0
}))

</script>

<template>
  <div class="personnel-availability">

    <div class="availability-description">
      These factors reduce the effective available workforce by accounting for leave, training, medical appointments,
      and other non-operational commitments. The simulation will automatically reduce personnel counts based on these
      parameters.
      <div class="availability-note">
        <strong>Note:</strong> Duty assignments are configured separately under "Continuous Duty Requirements"
        and are not included in these availability factors to avoid double-counting.
      </div>
    </div>

    <!-- MOS Tabs -->
    <div class="mos-tabs">
      <button :class="['mos-tab', { active: activeMOS === '7318' }]" @click="activeMOS = '7318'">
        7318 (Pilot)
      </button>
      <button :class="['mos-tab', { active: activeMOS === '7314' }]" @click="activeMOS = '7314'">
        7314 (SO)
      </button>
      <button :class="['mos-tab', { active: activeMOS === '0231' }]" @click="activeMOS = '0231'">
        0231 (Intel)
      </button>
    </div>

    <!-- 7318 Parameters -->
    <MosAvailability v-if="activeMOS === '7318'" mos="7318" mosLabel="7318" :config="modelValue['7318']"
      :staffing="pilotStaffing"
      @update="(field: string, value: any) => updateAvailability('7318', field as AvailabilityField | WorkScheduleField, value)" />

    <!-- 7314 Parameters -->
    <MosAvailability v-else-if="activeMOS === '7314'" mos="7314" mosLabel="7314" :config="modelValue['7314']"
      :staffing="soStaffing"
      @update="(field: string, value: any) => updateAvailability('7314', field as AvailabilityField | WorkScheduleField, value)" />

    <!-- 0231 Parameters -->
    <MosAvailability v-else mos="0231" mosLabel="0231" :config="modelValue['0231']" :staffing="intelStaffing"
      @update="(field: string, value: any) => updateAvailability('0231', field as AvailabilityField | WorkScheduleField, value)" />
  </div>
</template>

<style scoped>
.personnel-availability {
  margin-bottom: 16px;
}

.availability-description {
  font-size: 0.85rem;
  color: var(--text-muted-color);
  line-height: 1.4;
  margin-bottom: 16px;
  padding: 8px;
  background: rgba(59, 130, 246, 0.05);
  border-left: 2px solid var(--accent-blue);
  border-radius: 4px;
}

.availability-note {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 4px;
  font-size: 0.8rem;
  color: var(--text-color);
}

.availability-note strong {
  color: #f59e0b;
}

.mos-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 2px solid var(--border-color);
}

.mos-tab {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--text-muted-color);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: -2px;
}

.mos-tab:hover {
  color: var(--text-color);
  background: rgba(0, 0, 0, 0.02);
}

.mos-tab.active {
  color: var(--accent-blue);
  border-bottom-color: var(--accent-blue);
}

.availability-params {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.param-section {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
}

.param-section-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-color);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.param-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.param-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-field label {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-weight: 500;
}

.param-field input {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.85rem;
}

.param-field input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.field-hint {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-style: italic;
}

.shift-split-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-color);
}

.shift-split-toggle {
  margin-bottom: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.checkbox-label span {
  flex: 1;
}

.shift-config {
  margin-top: 12px;
  padding: 12px;
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 4px;
}

.availability-summary {
  border-radius: 6px;
  padding: 16px;
  margin-top: 8px;
}

.summary-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-color);
  margin-bottom: 12px;
}

.summary-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-label {
  font-size: 0.85rem;
  color: var(--text-muted-color);
  font-weight: 500;
}

.stat-value {
  font-size: 0.9rem;
  color: var(--text-color);
  font-weight: 600;
  font-family: monospace;
}

.availability-highlight {
  color: var(--accent-blue);
  font-size: 1.1rem;
  font-weight: 700;
}

.breakdown-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 2px solid rgba(59, 130, 246, 0.3);
}

.breakdown-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 10px;
}

.breakdown-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.breakdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  font-size: 0.8rem;
}

.breakdown-label {
  color: var(--text-muted-color);
  font-weight: 500;
}

.breakdown-value {
  color: var(--text-color);
  font-weight: 600;
  font-family: monospace;
}

.breakdown-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 700;
}

.breakdown-total .breakdown-label {
  color: var(--text-color);
}

.breakdown-total .breakdown-value {
  color: var(--accent-blue);
  font-size: 1rem;
}

.shift-summary-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 2px solid rgba(34, 197, 94, 0.3);
}

.shift-summary-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 12px;
}

.unit-shift-group {
  margin-bottom: 16px;
}

.unit-shift-group:last-child {
  margin-bottom: 0;
}

.unit-shift-header {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: 8px;
  padding: 6px 10px;
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid var(--accent-blue);
  border-radius: 2px;
}

.shift-summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.shift-summary-single {
  display: flex;
  justify-content: center;
}

.shift-summary-single .shift-summary-item {
  flex: 1;
  max-width: 100%;
}

.shift-summary-item {
  padding: 12px;
  background: rgba(34, 197, 94, 0.05);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 4px;
}

.shift-header {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-color);
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(34, 197, 94, 0.2);
}

.shift-detail {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 0.8rem;
}

.shift-label {
  color: var(--text-muted-color);
  font-weight: 500;
}

.shift-value {
  color: var(--text-color);
  font-weight: 600;
  font-family: monospace;
}

.shift-personnel {
  color: #16a34a;
  font-size: 0.95rem;
  font-weight: 700;
}
</style>

<script setup lang="ts">
interface DutyConfig {
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

interface Props {
  modelValue: DutyConfig
  dutyName: string
  showRecovery?: boolean
}

interface Emits {
  (e: 'update:modelValue', value: DutyConfig): void
}

const props = withDefaults(defineProps<Props>(), {
  showRecovery: false
})

const emit = defineEmits<Emits>()

function updateField(field: keyof DutyConfig, value: any) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value
  })
}

const mosOptions = [
  { key: 'pilot', label: 'Pilots (7318)', field: 'requires_pilot' as keyof DutyConfig },
  { key: 'so', label: 'SOs (7314)', field: 'requires_so' as keyof DutyConfig },
  { key: 'intel', label: 'Intel (0231)', field: 'requires_intel' as keyof DutyConfig }
]

function isMosEnabled(field: keyof DutyConfig): boolean {
  return (props.modelValue[field] as number) === 1
}

function toggleMos(field: keyof DutyConfig) {
  const currentValue = props.modelValue[field] as number
  updateField(field, currentValue === 1 ? 0 : 1)
}
</script>

<template>
  <div class="duty-card">
    <div class="duty-header">
      <label class="checkbox-label">
        <input type="checkbox" :checked="modelValue.enabled"
          @change="updateField('enabled', ($event.target as HTMLInputElement).checked)" />
        <span class="duty-name">{{ dutyName }}</span>
      </label>
    </div>

    <div v-if="modelValue.enabled" class="duty-params">
      <div class="param-field">
        <label>Shifts/Day</label>
        <input type="number" :value="modelValue.shifts_per_day" min="1" max="24"
          @input="updateField('shifts_per_day', parseInt(($event.target as HTMLInputElement).value) || 1)" />
      </div>

      <div class="param-field">
        <label>Hours/Shift</label>
        <input type="number" :value="modelValue.hours_per_shift" min="1" max="24" step="0.5"
          @input="updateField('hours_per_shift', parseFloat(($event.target as HTMLInputElement).value) || 8)" />
      </div>

      <div class="param-field">
        <label>Start Hour</label>
        <input type="number" :value="modelValue.start_hour" min="0" max="23"
          @input="updateField('start_hour', parseInt(($event.target as HTMLInputElement).value) || 0)" />
      </div>

      <div class="mos-section">
        <label class="section-label">Allocated MOSs <span class="hint">(select which MOSs can handle this
            duty)</span></label>
        <div v-for="mos in mosOptions" :key="mos.key" class="mos-row">
          <label class="mos-checkbox-label">
            <input type="checkbox" :checked="isMosEnabled(mos.field)" @change="toggleMos(mos.field)" />
            <span class="mos-label">{{ mos.label }}</span>
          </label>
        </div>
      </div>

      <div v-if="showRecovery" class="param-field">
        <label>Duty Rest (hrs)</label>
        <input type="number" :value="modelValue.duty_recovery_hours" min="0" max="72" step="1"
          @input="updateField('duty_recovery_hours', parseFloat(($event.target as HTMLInputElement).value) || 24)"
          title="Hours of rest required after completing duty shift" />
      </div>

      <div class="schedule-checkbox">
        <label class="checkbox-label">
          <input type="checkbox" :checked="modelValue.respect_work_schedule ?? false"
            @change="updateField('respect_work_schedule', ($event.target as HTMLInputElement).checked)" />
          <span class="checkbox-text">Respect Work Schedule</span>
        </label>
        <div class="hint">When enabled, only assign duty to crew on their working days/shifts</div>
      </div>

      <div class="duty-summary">
        {{ modelValue.shifts_per_day }} × {{ modelValue.hours_per_shift }}h =
        {{ modelValue.shifts_per_day * modelValue.hours_per_shift }}h/day
      </div>
    </div>
  </div>
</template>

<style scoped>
.duty-card {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
}

.duty-header {
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
}

.duty-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-color);
}

.duty-params {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 0.85rem;
}

.param-field input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.duty-summary {
  margin-top: 8px;
  padding: 6px 8px;
  background: rgba(59, 130, 246, 0.08);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--text-muted-color);
  text-align: center;
  font-family: monospace;
}

.mos-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.015);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.section-label {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.mos-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mos-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

.mos-checkbox-label input[type="checkbox"] {
  cursor: pointer;
  flex-shrink: 0;
}

.mos-label {
  font-size: 0.8rem;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: normal;
  font-style: italic;
}

.schedule-checkbox {
  padding: 8px;
  background: rgba(59, 130, 246, 0.05);
  border-radius: 4px;
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.schedule-checkbox .checkbox-label {
  margin-bottom: 4px;
}

.schedule-checkbox .checkbox-text {
  font-size: 0.8rem;
  color: var(--text-color);
  font-weight: 500;
}

.schedule-checkbox .hint {
  margin-left: 24px;
  font-size: 0.7rem;
  line-height: 1.3;
}
</style>

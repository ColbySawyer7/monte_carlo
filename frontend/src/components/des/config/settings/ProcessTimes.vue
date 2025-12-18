<script setup lang="ts">
// TODO: review this file for cleanup and optimization
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

interface Props {
  modelValue: ProcessTimesData
  disabled?: boolean
}

interface Emits {
  (e: 'update:modelValue', value: ProcessTimesData): void
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
})

const emit = defineEmits<Emits>()

function updateValue(field: keyof Omit<ProcessTimesData, 'mountTimes'>, event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value) || 0

  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value
  })
}

function updateMountTime(payloadType: string, event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value) || 0

  emit('update:modelValue', {
    ...props.modelValue,
    mountTimes: {
      ...props.modelValue.mountTimes,
      [payloadType]: value
    }
  })
}

function updateHoldCrew(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', {
    ...props.modelValue,
    hold_crew_during_process_times: target.checked
  })
}
</script>

<template>
  <div class="process-times">
    <div class="section-title">Process Times</div>

    <div class="form-row">
      <div class="form-field">
        <label>Preflight (hrs)</label>
        <input type="number" :value="modelValue.preflight" @input="updateValue('preflight', $event)" min="0" step="0.01"
          :disabled="disabled" />
      </div>

      <div class="form-field">
        <label>Postflight (hrs)</label>
        <input type="number" :value="modelValue.postflight" @input="updateValue('postflight', $event)" min="0"
          step="0.01" :disabled="disabled" />
      </div>

      <div class="form-field">
        <label>Turnaround (hrs)</label>
        <input type="number" :value="modelValue.turnaround" @input="updateValue('turnaround', $event)" min="0"
          step="0.01" :disabled="disabled" />
      </div>
    </div>

    <div class="mount-times-section">
      <div class="mount-times-header">Payload Mount Times (hrs)</div>
      <div class="mount-times-grid">
        <div class="mount-row">
          <label class="mount-label">SkyTower II</label>
          <input type="number" :value="modelValue.mountTimes['SkyTower II']"
            @input="updateMountTime('SkyTower II', $event)" min="0" step="0.01" :disabled="disabled" />
        </div>

        <div class="mount-row">
          <label class="mount-label">EW Pod</label>
          <input type="number" :value="modelValue.mountTimes['EW Pod']" @input="updateMountTime('EW Pod', $event)"
            min="0" step="0.01" :disabled="disabled" />
        </div>

        <div class="mount-row">
          <label class="mount-label">SmartSensor</label>
          <input type="number" :value="modelValue.mountTimes['SmartSensor']"
            @input="updateMountTime('SmartSensor', $event)" min="0" step="0.01" :disabled="disabled" />
        </div>

        <div class="mount-row">
          <label class="mount-label">Extended Range Tank</label>
          <input type="number" :value="modelValue.mountTimes['Extended Range Tank']"
            @input="updateMountTime('Extended Range Tank', $event)" min="0" step="0.01" :disabled="disabled" />
        </div>
      </div>
    </div>

    <div class="form-row">
      <div class="form-field checkbox-field">
        <label class="checkbox-label">
          <input type="checkbox" :checked="modelValue.hold_crew_during_process_times || false" @change="updateHoldCrew"
            :disabled="disabled" />
          <span>Hold crew during all process times (preflight, mount, postflight, turnaround)</span>
        </label>
        <div class="field-hint">When unchecked, crew is released during non-flight mission times and available for other
          demands</div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.process-times {
  margin-bottom: 16px;
}

.section-title {
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 12px;
  color: var(--text-color);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 8px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field label {
  font-size: 0.85rem;
  color: var(--text-muted-color);
  font-weight: 500;
}

.form-field input {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
}

.form-field input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.form-field input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-field {
  grid-column: 1 / -1;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-color);
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"]:disabled {
  cursor: not-allowed;
}

.checkbox-label span {
  font-weight: 500;
}

.field-hint {
  margin-top: 4px;
  margin-left: 26px;
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-style: italic;
}

.mount-times-section {
  margin-bottom: 8px;
}

.mount-times-header {
  font-size: 0.85rem;
  color: var(--text-muted-color);
  font-weight: 500;
  margin-bottom: 8px;
}

.mount-times-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.mount-row {
  display: grid;
  grid-template-columns: auto 80px;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.mount-label {
  font-size: 0.85rem;
  color: var(--text-color);
  font-weight: 500;
}

.mount-row input {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
  text-align: left;
}

.mount-row input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.mount-row input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

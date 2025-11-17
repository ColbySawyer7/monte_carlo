<script setup lang="ts">
interface ProcessTimesData {
  preflight: number
  postflight: number
  turnaround: number
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

    <div class="form-row">
      <div class="form-field">
        <label>SkyTower II mount (hrs)</label>
        <input type="number" :value="modelValue.mountTimes['SkyTower II']"
          @input="updateMountTime('SkyTower II', $event)" min="0" step="0.01" :disabled="disabled" />
      </div>

      <div class="form-field">
        <label>EW Pod mount (hrs)</label>
        <input type="number" :value="modelValue.mountTimes['EW Pod']" @input="updateMountTime('EW Pod', $event)" min="0"
          step="0.01" :disabled="disabled" />
      </div>

      <div class="form-field">
        <label>SmartSensor mount (hrs)</label>
        <input type="number" :value="modelValue.mountTimes['SmartSensor']"
          @input="updateMountTime('SmartSensor', $event)" min="0" step="0.01" :disabled="disabled" />
      </div>

      <div class="form-field">
        <label>Extended Range Tank mount (hrs)</label>
        <input type="number" :value="modelValue.mountTimes['Extended Range Tank']"
          @input="updateMountTime('Extended Range Tank', $event)" min="0" step="0.01" :disabled="disabled" />
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
</style>

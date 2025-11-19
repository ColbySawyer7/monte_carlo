<script setup lang="ts">
import { computed } from 'vue'

interface UnitOverrides {
  aircraft: number
  pilot: number
  so: number
  skyTower: number
  ewPod: number
  smartSensor: number
  extendedRange: number
}

interface SimSettingsData {
  horizonHours: number
  queueing: string
  iterations?: number  // Optional - managed by ScenarioSelector in Monte Carlo
  enableOverrides: boolean
  overrides: {
    vmu1: UnitOverrides
    vmu3: UnitOverrides
  }
  unitSplit: {
    vmu1: number
    vmu3: number
  }
}

interface Props {
  modelValue: SimSettingsData
  disabled?: boolean
}

interface Emits {
  (e: 'update:modelValue', value: SimSettingsData): void
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
})

const emit = defineEmits<Emits>()

const vmu1Percent = computed(() => {
  const total = props.modelValue.unitSplit.vmu1 + props.modelValue.unitSplit.vmu3
  return total > 0 ? Math.round((props.modelValue.unitSplit.vmu1 / total) * 100) : 50
})

const vmu3Percent = computed(() => {
  return 100 - vmu1Percent.value
})

function updateValue(field: 'horizonHours' | 'queueing', event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  const value = field === 'horizonHours' ? parseInt(target.value) || 1 : target.value

  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value
  })
}

function updateOverridesEnabled(event: Event) {
  const target = event.target as HTMLInputElement

  emit('update:modelValue', {
    ...props.modelValue,
    enableOverrides: target.checked
  })
}

function updateOverride(unit: 'vmu1' | 'vmu3', field: keyof UnitOverrides, event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseInt(target.value) || 0

  emit('update:modelValue', {
    ...props.modelValue,
    overrides: {
      ...props.modelValue.overrides,
      [unit]: {
        ...props.modelValue.overrides[unit],
        [field]: value
      }
    }
  })
}

function updateSplit(percentage: number) {
  const vmu1Value = Math.max(0, Math.min(100, percentage))
  const vmu3Value = 100 - vmu1Value

  emit('update:modelValue', {
    ...props.modelValue,
    unitSplit: {
      vmu1: vmu1Value,
      vmu3: vmu3Value
    }
  })
}

function handleBarClick(event: MouseEvent) {
  if (props.disabled) return

  const bar = event.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const percentage = ((event.clientX - rect.left) / rect.width) * 100
  updateSplit(percentage)
}

function handleMouseDown(event: MouseEvent) {
  if (props.disabled) return

  event.preventDefault()

  const handleMouseMove = (e: MouseEvent) => {
    const bar = (event.target as HTMLElement).closest('.split-bar') as HTMLElement
    if (!bar) return

    const rect = bar.getBoundingClientRect()
    const percentage = ((e.clientX - rect.left) / rect.width) * 100
    updateSplit(percentage)
  }

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

function handleTouchStart(event: TouchEvent) {
  if (props.disabled) return

  event.preventDefault()

  const handleTouchMove = (e: TouchEvent) => {
    const bar = (event.target as HTMLElement).closest('.split-bar') as HTMLElement
    if (!bar) return

    const rect = bar.getBoundingClientRect()
    const touch = e.touches[0]
    if (!touch) return

    const percentage = ((touch.clientX - rect.left) / rect.width) * 100
    updateSplit(percentage)
  }

  const handleTouchEnd = () => {
    document.removeEventListener('touchmove', handleTouchMove)
    document.removeEventListener('touchend', handleTouchEnd)
  }

  document.addEventListener('touchmove', handleTouchMove)
  document.addEventListener('touchend', handleTouchEnd)
}
</script>

<template>
  <div class="sim-settings">
    <div class="section-title">Simulation Settings</div>

    <div class="form-row">
      <div class="form-field">
        <label>Horizon (hours)</label>
        <input type="number" :value="modelValue.horizonHours" @input="updateValue('horizonHours', $event)" min="1"
          step="1" :disabled="disabled" />
      </div>

      <div class="form-field">
        <label>Queueing</label>
        <select :value="modelValue.queueing" @change="updateValue('queueing', $event)" :disabled="disabled">
          <option value="reject_if_unavailable">Reject if unavailable</option>
          <option value="queue">Queue</option>
          <option value="wait">Wait</option>
        </select>
      </div>
    </div>

    <!-- Resource Overrides Section -->
    <div class="overrides-section">
      <div class="form-field checkbox-field">
        <label>
          <input type="checkbox" :checked="modelValue.enableOverrides" @change="updateOverridesEnabled"
            :disabled="disabled" />
          <span>Resource Overrides</span>
        </label>
        <div class="help-text">Unchecked = use live state.</div>
      </div>

      <div class="overrides-table-wrapper">
        <table class="overrides-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Aircraft</th>
              <th>Pilot</th>
              <th>SO</th>
              <th>SkyTower II</th>
              <th>EW Pod</th>
              <th>SmartSensor</th>
              <th>Extended Ran...</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>VMU-1</strong></td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu1.aircraft"
                  @input="updateOverride('vmu1', 'aircraft', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu1.pilot"
                  @input="updateOverride('vmu1', 'pilot', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu1.so" @input="updateOverride('vmu1', 'so', $event)"
                  min="0" step="1" :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu1.skyTower"
                  @input="updateOverride('vmu1', 'skyTower', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu1.ewPod"
                  @input="updateOverride('vmu1', 'ewPod', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu1.smartSensor"
                  @input="updateOverride('vmu1', 'smartSensor', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu1.extendedRange"
                  @input="updateOverride('vmu1', 'extendedRange', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
            </tr>
            <tr>
              <td><strong>VMU-3</strong></td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu3.aircraft"
                  @input="updateOverride('vmu3', 'aircraft', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu3.pilot"
                  @input="updateOverride('vmu3', 'pilot', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu3.so" @input="updateOverride('vmu3', 'so', $event)"
                  min="0" step="1" :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu3.skyTower"
                  @input="updateOverride('vmu3', 'skyTower', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu3.ewPod"
                  @input="updateOverride('vmu3', 'ewPod', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu3.smartSensor"
                  @input="updateOverride('vmu3', 'smartSensor', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
              <td>
                <input type="number" :value="modelValue.overrides.vmu3.extendedRange"
                  @input="updateOverride('vmu3', 'extendedRange', $event)" min="0" step="1"
                  :disabled="disabled || !modelValue.enableOverrides" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Unit Split Section -->
    <div class="unit-split-section">
      <div class="section-title">Unit Split</div>
      <div class="slider-container">
        <div class="slider-labels">
          <span class="unit-label">VMU-1: {{ vmu1Percent }}%</span>
          <span class="unit-label">VMU-3: {{ vmu3Percent }}%</span>
        </div>
        <div class="split-bar-container">
          <div class="split-bar" @click="handleBarClick" :class="{ disabled: disabled }">
            <div class="split-bar-left" :style="{ width: vmu1Percent + '%' }">
              <span class="bar-label">VMU-1</span>
            </div>
            <div class="split-bar-right" :style="{ width: vmu3Percent + '%' }">
              <span class="bar-label">VMU-3</span>
            </div>
            <div class="split-handle" :style="{ left: vmu1Percent + '%' }" @mousedown="handleMouseDown"
              @touchstart="handleTouchStart">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="7" fill="white" stroke="currentColor" stroke-width="2" />
                <line x1="6" y1="5" x2="6" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                <line x1="10" y1="5" x2="10" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sim-settings {
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
  margin-bottom: 12px;
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

.form-field input,
.form-field select {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
}

.form-field input:focus,
.form-field select:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.form-field input:disabled,
.form-field select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.checkbox-field label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-color);
}

.checkbox-field input[type="checkbox"] {
  width: auto;
  cursor: pointer;
}

.help-text {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-style: italic;
  margin-top: 4px;
}

.overrides-section {
  margin: 16px 0;
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.overrides-table-wrapper {
  margin-top: 12px;
  overflow-x: auto;
}

.overrides-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.overrides-table th,
.overrides-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.overrides-table th {
  font-weight: 600;
  color: var(--text-muted-color);
  background: rgba(0, 0, 0, 0.03);
  white-space: nowrap;
}

.overrides-table td {
  color: var(--text-color);
}

.overrides-table input {
  width: 60px;
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.85rem;
}

.overrides-table input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.overrides-table input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.unit-split-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.slider-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-color);
}

.unit-label {
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.split-bar-container {
  position: relative;
  width: 100%;
  margin-top: 8px;
}

.split-bar {
  display: flex;
  width: 100%;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.split-bar.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.split-bar-left {
  background: linear-gradient(to right, #4a90e2, #5ba3f5);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 0.1s ease;
  min-width: 0;
}

.split-bar-right {
  background: linear-gradient(to right, #7b68ee, #9b88ff);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 0.1s ease;
  min-width: 0;
}

.bar-label {
  color: white;
  font-weight: 600;
  font-size: 0.85rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
  opacity: 0.9;
}

.split-handle {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  cursor: ew-resize;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  user-select: none;
}

.split-bar.disabled .split-handle {
  cursor: not-allowed;
}

.split-handle svg {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  color: #333;
}
</style>


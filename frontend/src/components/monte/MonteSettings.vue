<script setup lang="ts">
import { computed, watch, ref, nextTick } from 'vue'
import { extractEditableFields, getValueByPath } from '../../views/sim/DESconfigIntrospection'

interface SimulateSetting {
  id: string
  fieldPath: string
  fieldPathArray: string[]
  defaultValue: any
  constraints: any
}

interface Props {
  loading?: boolean
  currentConfig?: any
  simulateSettings: SimulateSetting[]
  iterations: number
  algorithm?: 'Step' | 'PERT'
  showWarning?: boolean
}

interface Emits {
  (e: 'update:simulate-settings', settings: SimulateSetting[]): void
  (e: 'update:iterations', iterations: number): void
  (e: 'update:algorithm', algorithm: 'Step' | 'PERT'): void
  (e: 'warning-cleared'): void
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  simulateSettings: () => [],
  iterations: 1000,
  algorithm: 'PERT',
  showWarning: false
})

const emit = defineEmits<Emits>()

// Local copy of settings for manipulation
const localSettings = computed({
  get: () => props.simulateSettings,
  set: (value) => emit('update:simulate-settings', value)
})

// Custom iterations value
const customIterations = ref<number>(props.iterations)
const customInputRef = ref<HTMLInputElement | null>(null)

// Check if current iterations value is a preset
const presetValues = [500, 1000, 5000, 10000]
const isCustomIterations = computed(() => !presetValues.includes(props.iterations))

// Handle iterations selection (preset or custom)
const selectedIterationsMode = computed({
  get: () => isCustomIterations.value ? -1 : props.iterations,
  set: (value: number) => {
    if (value === -1) {
      // Custom mode - initialize with current value or a default
      if (presetValues.includes(props.iterations)) {
        // If current value is a preset, use a reasonable default for custom
        customIterations.value = 10000
      } else {
        // If already custom, keep the current value
        customIterations.value = props.iterations
      }
      // Emit the custom value immediately so the input shows with a value
      emit('update:iterations', customIterations.value)
    } else {
      // Preset selected
      emit('update:iterations', value)
    }
  }
})

// Handle custom iterations input
function handleCustomIterationsChange(value: string) {
  const numValue = parseInt(value, 10)
  if (!isNaN(numValue) && numValue > 0) {
    customIterations.value = numValue
    emit('update:iterations', numValue)
  }
}

// Local algorithm value
const localAlgorithm = computed({
  get: () => props.algorithm,
  set: (value) => emit('update:algorithm', value)
})

// Extract available fields from current config - only numeric fields for Monte Carlo
const availableFields = computed(() => {
  if (!props.currentConfig) return []
  const allFields = extractEditableFields(props.currentConfig)
  // Only show numeric fields for Monte Carlo simulation
  return allFields.filter(field => field.constraints.type === 'number')
})

// Check if a field is enabled (in simulateSettings)
function isFieldEnabled(fieldPath: string): boolean {
  return localSettings.value.some(s => s.fieldPath === fieldPath)
}

// Check if all variables are enabled
const allVariablesEnabled = computed(() => {
  if (availableFields.value.length === 0) return false
  return availableFields.value.every(field => isFieldEnabled(field.pathString))
})

// Toggle all variables on/off
function toggleAllVariables(enabled: boolean) {
  if (enabled) {
    // Enable all variables
    const newSettings: SimulateSetting[] = []
    for (const field of availableFields.value) {
      // Skip if already enabled
      if (isFieldEnabled(field.pathString)) continue
      
      const defaultValue = getValueByPath(props.currentConfig, field.path)
      newSettings.push({
        id: `sim-${Date.now()}-${Math.random()}`,
        fieldPath: field.pathString,
        fieldPathArray: field.path,
        defaultValue: defaultValue !== undefined ? defaultValue : field.currentValue,
        constraints: field.constraints
      })
    }
    // Add new settings to existing ones
    const updatedSettings = [...localSettings.value, ...newSettings]
    emit('update:simulate-settings', updatedSettings)
    // Clear warning if this is the first valid setting
    if (props.showWarning && newSettings.length > 0) {
      emit('warning-cleared')
    }
  } else {
    // Disable all variables
    emit('update:simulate-settings', [])
  }
}

// Toggle a field on/off for simulation
function toggleField(field: any, enabled: boolean) {
  if (enabled) {
    // Add field to simulateSettings
    const defaultValue = getValueByPath(props.currentConfig, field.path)
    const newId = `sim-${Date.now()}`
    const updatedSettings = [
      ...localSettings.value,
      {
        id: newId,
        fieldPath: field.pathString,
        fieldPathArray: field.path,
        defaultValue: defaultValue !== undefined ? defaultValue : field.currentValue,
        constraints: field.constraints
      }
    ]
    emit('update:simulate-settings', updatedSettings)
    // Clear warning if this is the first valid setting
    if (props.showWarning) {
      emit('warning-cleared')
    }
  } else {
    // Remove field from simulateSettings
    const updatedSettings = localSettings.value.filter(s => s.fieldPath !== field.pathString)
    emit('update:simulate-settings', updatedSettings)
  }
}


// Watch for valid settings and clear warning when at least one is added
watch(() => localSettings.value, (settings) => {
  const hasValidSetting = settings.some(s => 
    s.fieldPath && s.constraints && s.constraints.type === 'number'
  )
  if (hasValidSetting && props.showWarning) {
    emit('warning-cleared')
  }
}, { deep: true })

// Update customIterations when props.iterations changes and it's a custom value
watch(() => props.iterations, (newValue) => {
  if (isCustomIterations.value) {
    customIterations.value = newValue
  }
})

// Focus the custom input when Custom mode is selected
watch(() => selectedIterationsMode.value, async (newValue) => {
  if (newValue === -1) {
    await nextTick()
    if (customInputRef.value) {
      customInputRef.value.focus()
      customInputRef.value.select()
    }
  }
})
</script>

<template>
  <div class="monte-settings" :class="{ 'warning-outline': showWarning }">
    <!-- Iterations and Algorithm Fields -->
    <div class="iterations-row">
      <div class="form-field iterations-field">
        <label>Iterations:</label>
        <div class="iterations-input-wrapper">
          <select v-model="selectedIterationsMode" :disabled="loading" class="iterations-select">
            <option :value="500">500 (Quick)</option>
            <option :value="1000">1,000 (Recommended)</option>
            <option :value="5000">5,000 (High Precision)</option>
            <option :value="10000">10,000 (Very High Precision)</option>
            <option :value="-1">Custom</option>
          </select>
          <input
            v-if="selectedIterationsMode === -1"
            type="number"
            :value="customIterations"
            @input="handleCustomIterationsChange(($event.target as HTMLInputElement).value)"
            @focus="($event.target as HTMLInputElement).select()"
            :disabled="loading"
            min="1"
            class="custom-iterations-input"
            placeholder="Enter custom iterations"
            ref="customInputRef"
          />
        </div>
      </div>
      <div class="form-field algorithm-field">
        <label>Algorithm:</label>
        <select v-model="localAlgorithm" :disabled="loading" class="algorithm-select">
          <option value="Step">Step</option>
          <option value="PERT">PERT</option>
        </select>
      </div>
    </div>

    <!-- Simulate Settings Section -->
    <div class="simulate-settings-section">
      <div class="simulate-settings-header">
        <div class="header-content">
          <div>
            <h4>What variables would you like to simulate?</h4>
            <p class="section-description">Toggle variables on/off to include them in Monte Carlo simulation. All variables start disabled.</p>
          </div>
          <div v-if="availableFields.length > 0" class="enable-all-control">
            <label class="toggle-switch">
              <input 
                type="checkbox" 
                :checked="allVariablesEnabled"
                @change="toggleAllVariables(($event.target as HTMLInputElement).checked)"
                :disabled="loading" />
              <span class="toggle-slider"></span>
            </label>
            <!-- Chaos mode toggle: This should be disabled or hidden in production -->
            <span class="enable-all-label">Chaos Mode</span>
          </div>
        </div>
      </div>

      <div v-if="availableFields.length === 0" class="no-fields-message">
        <p>No numeric variables available. Please load a scenario first.</p>
      </div>

      <div v-else class="variables-grid">
        <div v-for="field in availableFields" :key="field.pathString" class="variable-card"
          :class="{ 'variable-enabled': isFieldEnabled(field.pathString) }">
          <!-- Variable Header -->
          <div class="variable-header">
            <div class="variable-title-group">
              <h5 class="variable-label">{{ field.constraints.label || field.pathString }}</h5>
              <span class="variable-type-badge number">number</span>
            </div>
          </div>

          <!-- Variable Constraints -->
          <div class="variable-constraints">
            <div class="constraint-tags">
              <span v-if="field.constraints.min !== undefined" class="constraint-tag">
                Min: {{ field.constraints.min }}
              </span>
              <span v-if="field.constraints.max !== undefined" class="constraint-tag">
                Max: {{ field.constraints.max }}
              </span>
              <span v-if="field.constraints.step !== undefined" class="constraint-tag">
                Step: {{ field.constraints.step }}
              </span>
            </div>
            <p v-if="field.constraints.description" class="field-description">
              {{ field.constraints.description }}
            </p>
          </div>

          <!-- Toggle Switch -->
          <div class="variable-toggle-section">
            <label class="toggle-switch">
              <input 
                type="checkbox" 
                :checked="isFieldEnabled(field.pathString)"
                @change="toggleField(field, ($event.target as HTMLInputElement).checked)"
                :disabled="loading" />
              <span class="toggle-slider"></span>
            </label>
            <span class="toggle-label">{{ isFieldEnabled(field.pathString) ? 'Enabled' : 'Disabled' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.monte-settings {
  margin-top: 16px;
}

.iterations-row {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  gap: 6px;
  align-items: flex-end;
}

.iterations-field {
  flex: 0 0 auto;
}

.algorithm-field {
  flex: 0 0 auto;
  min-width: 150px;
}

.iterations-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.iterations-input-wrapper .iterations-select {
  flex: 1;
  max-width: 300px;
}

.custom-iterations-input {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
  width: 150px;
  flex-shrink: 0;
}

.custom-iterations-input:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.custom-iterations-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.algorithm-select {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
  width: 100%;
}

.algorithm-select:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.algorithm-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.iterations-select {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
  width: 100%;
}

.iterations-select:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.iterations-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

/* Simulate Settings Section */
.simulate-settings-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.simulate-settings-header {
  margin-bottom: 16px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.simulate-settings-header h4 {
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
}

.section-description {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted-color);
  line-height: 1.5;
}

.enable-all-control {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  padding: 8px 12px;
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.enable-all-label {
  font-size: 0.9rem;
  color: var(--text-color);
  font-weight: 500;
  white-space: nowrap;
}

.no-fields-message {
  padding: 24px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  text-align: center;
  color: var(--text-muted-color);
  font-size: 0.9rem;
}

.no-fields-message p {
  margin: 0;
}

/* Variables Grid */
.variables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
}

.variable-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 16px;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.variable-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.variable-card.variable-enabled {
  border-color: var(--accent-blue);
  background: rgba(59, 130, 246, 0.02);
}

.variable-header {
  margin-bottom: 8px;
}

.variable-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.variable-label {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
  flex: 1;
}

.variable-type-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.variable-type-badge.number {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.variable-constraints {
  padding-top: 8px;
}

.constraint-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.constraint-tag {
  padding: 3px 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 3px;
  font-size: 0.7rem;
  color: var(--text-muted-color);
  font-family: 'Courier New', monospace;
}

.field-description {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-style: italic;
  line-height: 1.4;
}

.variable-toggle-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  margin-top: auto;
}

.toggle-label {
  font-size: 0.85rem;
  color: var(--text-color);
  font-weight: 500;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 26px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.3s;
  border-radius: 26px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: #10b981;
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(24px);
}

.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.warning-outline {
  border: 2px solid var(--chart-red);
  border-radius: 8px;
  padding: 14px;
  animation: pulse-warning 0.5s ease-in-out;
}

@keyframes pulse-warning {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
  }
}

@media (max-width: 768px) {
  .variables-grid {
    grid-template-columns: 1fr;
  }

  .header-content {
    flex-direction: column;
    align-items: stretch;
  }

  .enable-all-control {
    justify-content: center;
    margin-top: 8px;
  }
}
</style>

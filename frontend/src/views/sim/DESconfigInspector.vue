<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  extractEditableFields,
  groupFieldsByCategory,
  summarizeConfig,
  type ConfigField
} from './DESconfigIntrospection'
import { DESconfigDefaults } from './DESconfigDefaults'
import { useLocalStorage } from '../../composables/useLocalStorage'

// Use live DES config from shared composable - get all reactive refs
const {
  currentConfig,
  processTimes,
  simSettings,
  missionTypes,
  demand,
  dutyRequirements,
  personnelAvailability,
  hasLoadedScenario,
  currentScenarioName
} = DESconfigDefaults()

// Use localStorage composable for saving
const storage = useLocalStorage()

// Map category names to their corresponding reactive refs
const reactiveRefs: Record<string, any> = {
  processTimes: processTimes,
  simSettings: simSettings,
  missionTypes: missionTypes,
  demand: demand,
  dutyRequirements: dutyRequirements,
  personnelAvailability: personnelAvailability
}

// Extract fields dynamically from live DES config
const allFields = computed(() => extractEditableFields(currentConfig.value))

const summary = computed(() => summarizeConfig(currentConfig.value))

const groupedFields = computed(() => groupFieldsByCategory(allFields.value))

const selectedCategory = ref<string>('')

// Initialize to first category
onMounted(() => {
  const categories = Object.keys(groupedFields.value)
  if (categories.length > 0 && categories[0]) {
    selectedCategory.value = categories[0]
  }
})

const currentCategoryFields = computed(() => {
  return selectedCategory.value ? groupedFields.value[selectedCategory.value] || [] : []
})

function selectCategory(category: string) {
  selectedCategory.value = category
}

function updateFieldValue(field: ConfigField, newValue: any) {
  // Get the root reactive ref based on the first path segment (category)
  const rootKey = field.path[0]
  const rootRef = rootKey ? reactiveRefs[rootKey] : null

  if (!rootRef) {
    console.error('Could not find reactive ref for path:', field.path)
    return
  }

  // Navigate to the field and update it
  let target: any = rootRef.value
  for (let i = 1; i < field.path.length - 1; i++) {
    const key = field.path[i]
    if (key !== undefined) {
      target = target[key]
    }
  }

  const lastKey = field.path[field.path.length - 1]
  if (lastKey !== undefined) {
    target[lastKey] = newValue

    // Save to localStorage after updating
    storage.saveDESState(
      {
        processTimes: processTimes.value,
        simSettings: simSettings.value,
        missionTypes: missionTypes.value,
        demand: demand.value,
        dutyRequirements: dutyRequirements.value,
        personnelAvailability: personnelAvailability.value,
        hasLoadedScenario: hasLoadedScenario.value,
        currentScenarioName: currentScenarioName.value
      },
      {
        simulationResults: null,
        resultsScenarioName: '',
        resultsTimestamp: ''
      }
    )
  }
}

function formatValue(value: any): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return value.toString()
  return String(value)
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    simulation: '⚙️',
    agents: '👥',
    environment: '🌍',
    rules: '📋',
    processTimes: '⏱️',
    simSettings: '⚙️',
    missionTypes: '✈️',
    demand: '📊',
    dutyRequirements: '👮',
    personnelAvailability: '👥',
    default: '📦'
  }
  return icons[category] ?? icons['default']!
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    simulation: '#3b82f6',
    agents: '#10b981',
    environment: '#f59e0b',
    rules: '#8b5cf6',
    processTimes: '#3b82f6',
    simSettings: '#10b981',
    missionTypes: '#f59e0b',
    demand: '#8b5cf6',
    dutyRequirements: '#ec4899',
    personnelAvailability: '#06b6d4',
    default: '#6b7280'
  }
  return colors[category] ?? colors['default']!
}
</script>

<template>
  <div class="config-inspector-container">
    <!-- Page Header -->
    <div class="section-header">
      <div class="header-row">
        <div>
          <h2>CONFIGURATION INSPECTOR</h2>
          <p class="section-desc">
            Purpose: dynamically discover and inspect all editable configuration parameters in the DES simulator.<br>
            Benefits: automatic field detection, type inference, constraint validation, and real-time editing.<br>
            Best use: understanding config structure, debugging parameter values, validating constraints, and bulk
            config operations.
          </p>
        </div>
      </div>
    </div>

    <!-- Config Summary Card -->
    <div class="summary-card">
      <h3>📊 Configuration Summary</h3>
      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-label">Total Fields</span>
          <span class="stat-value">{{ summary.totalFields }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Numeric</span>
          <span class="stat-value numeric">{{ summary.numericFields }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Boolean</span>
          <span class="stat-value boolean">{{ summary.booleanFields }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">String</span>
          <span class="stat-value string">{{ summary.stringFields }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Categories</span>
          <span class="stat-value">{{ summary.categories.length }}</span>
        </div>
      </div>
    </div>

    <!-- Main Layout -->
    <div class="config-layout">
      <!-- Category Sidebar -->
      <aside class="category-sidebar">
        <h3>Categories</h3>
        <div class="category-list">
          <button v-for="(fields, category) in groupedFields" :key="category" class="category-btn"
            :class="{ active: selectedCategory === category }" @click="selectCategory(category)"
            :style="{ borderLeftColor: getCategoryColor(category) }">
            <span class="category-icon">{{ getCategoryIcon(category) }}</span>
            <div class="category-info">
              <span class="category-name">{{ category }}</span>
              <span class="category-count">{{ fields.length }} fields</span>
            </div>
          </button>
        </div>
      </aside>

      <!-- Field Details -->
      <main class="field-details">
        <div v-if="selectedCategory" class="details-header">
          <h3>
            <span class="category-icon-large">{{ getCategoryIcon(selectedCategory) }}</span>
            {{ selectedCategory }}
          </h3>
          <p class="category-subtitle">{{ currentCategoryFields.length }} editable fields</p>
        </div>

        <div v-if="currentCategoryFields.length > 0" class="field-grid">
          <div v-for="field in currentCategoryFields" :key="field.pathString" class="field-card">
            <!-- Field Header -->
            <div class="field-header">
              <div class="field-title-group">
                <h4 class="field-label">{{ field.constraints.label }}</h4>
                <span class="field-type-badge" :class="field.constraints.type">
                  {{ field.constraints.type }}
                </span>
              </div>
              <code class="field-path">{{ field.pathString }}</code>
            </div>

            <!-- Field Value Display -->
            <div class="field-value-section">
              <div class="value-display">
                <span class="value-label">Current Value:</span>
                <span class="value-text">
                  {{ formatValue(field.currentValue) }}
                  <span v-if="field.constraints.unit" class="value-unit">
                    {{ field.constraints.unit }}
                  </span>
                </span>
              </div>

              <!-- Interactive Input -->
              <div class="value-input">
                <!-- Number Input -->
                <input v-if="field.constraints.type === 'number'" type="number" :value="field.currentValue"
                  :min="field.constraints.min" :max="field.constraints.max" :step="field.constraints.step"
                  @input="updateFieldValue(field, parseFloat(($event.target as HTMLInputElement).value))"
                  class="input-field" />

                <!-- Boolean Toggle -->
                <label v-else-if="field.constraints.type === 'boolean'" class="toggle-switch">
                  <input type="checkbox" :checked="field.currentValue"
                    @change="updateFieldValue(field, ($event.target as HTMLInputElement).checked)" />
                  <span class="toggle-slider"></span>
                </label>

                <!-- String Input -->
                <input v-else-if="field.constraints.type === 'string'" type="text" :value="field.currentValue"
                  @input="updateFieldValue(field, ($event.target as HTMLInputElement).value)" class="input-field" />

                <!-- Select Input -->
                <select v-else-if="field.constraints.type === 'select'" :value="field.currentValue"
                  @change="updateFieldValue(field, ($event.target as HTMLSelectElement).value)" class="input-field">
                  <option v-for="option in field.constraints.options" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Field Constraints -->
            <div class="field-constraints">
              <div v-if="field.constraints.type === 'number'" class="constraint-tags">
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
          </div>
        </div>

        <div v-else class="empty-state">
          <p>Select a category to view fields</p>
        </div>
      </main>
    </div>

    <!-- Debug Panel (Optional - can remove in production) -->
    <details class="debug-panel">
      <summary>🔍 Debug: All Detected Fields ({{ allFields.length }})</summary>
      <pre class="debug-content">{{ JSON.stringify(allFields, null, 2) }}</pre>
    </details>
  </div>
</template>

<style scoped>
.config-inspector-container {
  padding: 20px;
}

.section-header {
  margin-bottom: 24px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
}

.section-header h2 {
  margin: 0 0 8px 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-color);
}

.section-desc {
  margin: 0;
  color: var(--text-muted-color);
  font-size: 0.9rem;
  line-height: 1.5;
}

/* Summary Card */
.summary-card {
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.summary-card h3 {
  margin: 0 0 16px 0;
  font-size: 1.1rem;
  color: var(--text-color);
}

.summary-stats {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent-blue);
}

.stat-value.numeric {
  color: #3b82f6;
}

.stat-value.boolean {
  color: #10b981;
}

.stat-value.string {
  color: #f59e0b;
}

/* Layout */
.config-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  min-height: 600px;
}

/* Category Sidebar */
.category-sidebar {
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  height: fit-content;
  position: sticky;
  top: 20px;
}

.category-sidebar h3 {
  margin: 0 0 16px 0;
  font-size: 0.9rem;
  color: var(--text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-left: 3px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.category-btn:hover {
  background: rgba(59, 130, 246, 0.05);
  border-left-color: var(--accent-blue);
}

.category-btn.active {
  background: rgba(59, 130, 246, 0.1);
  border-left-width: 4px;
}

.category-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.category-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.category-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-color);
  text-transform: capitalize;
}

.category-count {
  font-size: 0.75rem;
  color: var(--text-muted-color);
}

/* Field Details */
.field-details {
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 24px;
}

.details-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.details-header h3 {
  margin: 0 0 4px 0;
  font-size: 1.3rem;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 12px;
  text-transform: capitalize;
}

.category-icon-large {
  font-size: 2rem;
}

.category-subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted-color);
}

/* Field Grid */
.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
}

.field-card {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 16px;
  transition: box-shadow 0.2s;
}

.field-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.field-header {
  margin-bottom: 12px;
}

.field-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.field-label {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
  flex: 1;
}

.field-type-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field-type-badge.number {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.field-type-badge.boolean {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.field-type-badge.string {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.field-type-badge.select {
  background: rgba(139, 92, 246, 0.15);
  color: #8b5cf6;
}

.field-path {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-family: 'Courier New', monospace;
  background: rgba(0, 0, 0, 0.03);
  padding: 4px 6px;
  border-radius: 3px;
}

.field-value-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.value-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: rgba(59, 130, 246, 0.05);
  border-radius: 4px;
}

.value-label {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-weight: 500;
}

.value-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
}

.value-unit {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-weight: normal;
  margin-left: 4px;
}

.value-input {
  display: flex;
  align-items: center;
}

.input-field {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
}

.input-field:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
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

.toggle-switch input:checked+.toggle-slider {
  background-color: #10b981;
}

.toggle-switch input:checked+.toggle-slider:before {
  transform: translateX(24px);
}

/* Field Constraints */
.field-constraints {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.constraint-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
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
  margin: 8px 0 0 0;
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-style: italic;
  line-height: 1.4;
}

/* Empty State */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: var(--text-muted-color);
  font-size: 1rem;
}

/* Debug Panel */
.debug-panel {
  margin-top: 24px;
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.debug-panel summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-color);
  user-select: none;
}

.debug-content {
  margin-top: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
  font-size: 0.75rem;
  overflow-x: auto;
  max-height: 500px;
  overflow-y: auto;
}

@media (max-width: 1200px) {
  .config-layout {
    grid-template-columns: 1fr;
  }

  .category-sidebar {
    position: static;
  }

  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>

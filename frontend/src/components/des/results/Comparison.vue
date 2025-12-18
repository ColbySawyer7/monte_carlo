<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { ref, computed, onMounted } from 'vue'

interface SimResults {
  missions: {
    requested: number
    started: number
    completed: number
    rejected: number
  }
  rejections: {
    aircraft: number
    pilot: number
    so: number
    intel: number
    payload: number
  }
  utilization: Record<string, {
    aircraft: number
    aircraft_efficiency: number
    aircraft_stats: any
    pilot: number
    pilot_efficiency: number
    pilot_stats: any
    so: number
    so_efficiency: number
    so_stats: any
    intel: number
    intel_efficiency: number
    intel_stats: any
    availability_factors?: any
    initial_crew?: any
    effective_crew?: any
    peak_concurrent?: any
  }>
  by_type?: Record<string, any>
}

interface SavedResult {
  id: string
  name: string
  timestamp: string
  scenarioName: string
  results: SimResults
}

interface Props {
  currentResults: SimResults | null
  currentScenarioName: string
}

const props = defineProps<Props>()

const savedResults = ref<SavedResult[]>([])
const selectedResults = ref<Set<string>>(new Set())
const newResultName = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')

// Load saved results from localStorage
onMounted(() => {
  const stored = localStorage.getItem('desComparisonResults')
  if (stored) {
    try {
      savedResults.value = JSON.parse(stored)
    } catch (e) {
      console.error('Failed to load saved results:', e)
      savedResults.value = []
    }
  }
})

// Save results to localStorage
function saveToLocalStorage() {
  localStorage.setItem('desComparisonResults', JSON.stringify(savedResults.value))
}

// Save current results
function saveCurrentResults() {
  if (!props.currentResults) return

  // Limit to 3 saved results
  if (savedResults.value.length >= 3) {
    alert('Maximum of 3 results can be saved. Please delete an existing result first.')
    return
  }

  const name = newResultName.value.trim() || `Result ${savedResults.value.length + 1}`

  const saved: SavedResult = {
    id: Date.now().toString(),
    name,
    timestamp: new Date().toLocaleString(),
    scenarioName: props.currentScenarioName || 'Unnamed Scenario',
    results: props.currentResults
  }

  savedResults.value.push(saved)
  saveToLocalStorage()
  newResultName.value = ''
}

// Delete a saved result
function deleteResult(id: string) {
  savedResults.value = savedResults.value.filter(r => r.id !== id)
  selectedResults.value.delete(id)
  saveToLocalStorage()
}

// Toggle result selection
function toggleSelection(id: string) {
  if (selectedResults.value.has(id)) {
    selectedResults.value.delete(id)
  } else {
    selectedResults.value.add(id)
  }
}

// Start editing a result name
function startEditing(result: SavedResult) {
  editingId.value = result.id
  editingName.value = result.name
}

// Cancel editing
function cancelEditing() {
  editingId.value = null
  editingName.value = ''
}

// Save edited name
function saveEditedName(id: string) {
  const result = savedResults.value.find(r => r.id === id)
  if (result) {
    const trimmedName = editingName.value.trim()
    if (trimmedName) {
      result.name = trimmedName
      saveToLocalStorage()
    }
  }
  cancelEditing()
}

// Get selected results for comparison
const comparisonResults = computed(() => {
  return savedResults.value.filter(r => selectedResults.value.has(r.id))
})

// Comparison metrics
const comparisonData = computed(() => {
  const results = comparisonResults.value
  if (results.length === 0) return null

  const metrics = {
    missions: [] as any[],
    rejections: [] as any[],
    utilization: [] as any[]
  }

  results.forEach(result => {
    metrics.missions.push({
      name: result.name,
      requested: result.results.missions.requested,
      started: result.results.missions.started,
      completed: result.results.missions.completed,
      rejected: result.results.missions.rejected,
      completionRate: result.results.missions.requested > 0
        ? (result.results.missions.completed / result.results.missions.requested * 100).toFixed(1)
        : '0.0'
    })

    metrics.rejections.push({
      name: result.name,
      aircraft: result.results.rejections.aircraft,
      pilot: result.results.rejections.pilot,
      so: result.results.rejections.so,
      payload: result.results.rejections.payload,
      total: Object.values(result.results.rejections).reduce((a, b) => a + b, 0)
    })

    // Aggregate utilization across all units
    const units = Object.values(result.results.utilization)
    const avgAircraft = units.reduce((sum, u) => sum + (u.aircraft || 0), 0) / units.length
    const avgPilot = units.reduce((sum, u) => sum + (u.pilot || 0), 0) / units.length
    const avgSo = units.reduce((sum, u) => sum + (u.so || 0), 0) / units.length

    metrics.utilization.push({
      name: result.name,
      aircraft: avgAircraft.toFixed(1),
      pilot: avgPilot.toFixed(1),
      so: avgSo.toFixed(1)
    })
  })

  return metrics
})

// Calculate percentage difference between first and other results
function getDifference(baseValue: number, compareValue: number): string {
  if (baseValue === 0) return 'N/A'
  const diff = ((compareValue - baseValue) / baseValue * 100)
  const sign = diff > 0 ? '+' : ''
  return `${sign}${diff.toFixed(1)}%`
}
</script>

<template>
  <div class="comparison">
    <!-- Save Current Results Section -->
    <div class="save-section">
      <h3>Save Current Results</h3>
      <div v-if="!currentResults" class="no-results-message">
        <p>No results available. Run a simulation first.</p>
      </div>
      <div v-else class="save-controls">
        <input v-model="newResultName" type="text" placeholder="Enter result name (optional)" class="name-input"
          @keyup.enter="saveCurrentResults" />
        <button @click="saveCurrentResults" :disabled="savedResults.length >= 3" class="btn primary">
          Save Result ({{ savedResults.length }}/3)
        </button>
      </div>
      <p v-if="savedResults.length >= 3" class="limit-message">
        Maximum of 3 results saved. Delete one to save more.
      </p>
    </div>

    <!-- Saved Results List -->
    <div class="saved-results-section">
      <h3>Saved Results</h3>
      <div v-if="savedResults.length === 0" class="empty-state">
        <p>No saved results yet. Save your current results to start comparing.</p>
      </div>
      <div v-else class="saved-results-list">
        <div v-for="result in savedResults" :key="result.id" class="saved-result-card"
          :class="{ selected: selectedResults.has(result.id) }">
          <div class="result-header">
            <label class="checkbox-label">
              <input type="checkbox" :checked="selectedResults.has(result.id)" @change="toggleSelection(result.id)" />
              <div v-if="editingId === result.id" class="edit-name-container" @click.stop>
                <input v-model="editingName" type="text" class="edit-name-input"
                  @keyup.enter="saveEditedName(result.id)" @keyup.esc="cancelEditing" @blur="saveEditedName(result.id)"
                  ref="editInput" autofocus />
              </div>
              <span v-else class="result-name" @click.stop="startEditing(result)">{{ result.name }}</span>
            </label>
            <button @click="deleteResult(result.id)" class="btn-delete" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
              </svg>
            </button>
          </div>
          <div class="result-meta">
            <span class="meta-item">{{ result.scenarioName }}</span>
            <span class="meta-item">{{ result.timestamp }}</span>
          </div>
          <div class="result-summary">
            <span class="summary-stat">
              Completed: <strong>{{ result.results.missions.completed }}</strong> / {{ result.results.missions.requested
              }}
            </span>
            <span class="summary-stat">
              Rejected: <strong>{{ result.results.missions.rejected }}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Comparison View -->
    <div v-if="comparisonData && comparisonResults.length > 0" class="comparison-section">
      <h3>Comparison ({{ comparisonResults.length }} selected)</h3>

      <!-- Mission Metrics -->
      <div class="comparison-table">
        <h4>Mission Performance</h4>
        <table>
          <thead>
            <tr>
              <th>Result</th>
              <th>Requested</th>
              <th>Completed</th>
              <th>Rejected</th>
              <th>Completion Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(mission, idx) in comparisonData.missions" :key="idx">
              <td class="name-cell">{{ mission.name }}</td>
              <td>{{ mission.requested }}</td>
              <td>
                {{ mission.completed }}
                <span v-if="idx > 0" class="diff-badge"
                  :class="{ positive: mission.completed > comparisonData.missions[0].completed }">
                  {{ getDifference(comparisonData.missions[0].completed, mission.completed) }}
                </span>
              </td>
              <td>
                {{ mission.rejected }}
                <span v-if="idx > 0" class="diff-badge"
                  :class="{ negative: mission.rejected > comparisonData.missions[0].rejected }">
                  {{ getDifference(comparisonData.missions[0].rejected, mission.rejected) }}
                </span>
              </td>
              <td>
                {{ mission.completionRate }}%
                <span v-if="idx > 0" class="diff-badge"
                  :class="{ positive: parseFloat(mission.completionRate) > parseFloat(comparisonData.missions[0].completionRate) }">
                  {{ getDifference(parseFloat(comparisonData.missions[0].completionRate),
                    parseFloat(mission.completionRate)) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Rejection Metrics -->
      <div class="comparison-table">
        <h4>Rejections by Resource</h4>
        <table>
          <thead>
            <tr>
              <th>Result</th>
              <th>Aircraft</th>
              <th>Pilot</th>
              <th>SO</th>
              <th>Payload</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(rejection, idx) in comparisonData.rejections" :key="idx">
              <td class="name-cell">{{ rejection.name }}</td>
              <td>{{ rejection.aircraft }}</td>
              <td>{{ rejection.pilot }}</td>
              <td>{{ rejection.so }}</td>
              <td>{{ rejection.payload }}</td>
              <td>
                <strong>{{ rejection.total }}</strong>
                <span v-if="idx > 0" class="diff-badge"
                  :class="{ negative: rejection.total > comparisonData.rejections[0].total }">
                  {{ getDifference(comparisonData.rejections[0].total, rejection.total) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Utilization Metrics -->
      <div class="comparison-table">
        <h4>Average Utilization (%)</h4>
        <table>
          <thead>
            <tr>
              <th>Result</th>
              <th>Aircraft</th>
              <th>Pilot</th>
              <th>SO</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(util, idx) in comparisonData.utilization" :key="idx">
              <td class="name-cell">{{ util.name }}</td>
              <td>
                {{ util.aircraft }}%
                <span v-if="idx > 0" class="diff-badge"
                  :class="{ positive: parseFloat(util.aircraft) > parseFloat(comparisonData.utilization[0].aircraft) }">
                  {{ getDifference(parseFloat(comparisonData.utilization[0].aircraft), parseFloat(util.aircraft)) }}
                </span>
              </td>
              <td>
                {{ util.pilot }}%
                <span v-if="idx > 0" class="diff-badge"
                  :class="{ positive: parseFloat(util.pilot) > parseFloat(comparisonData.utilization[0].pilot) }">
                  {{ getDifference(parseFloat(comparisonData.utilization[0].pilot), parseFloat(util.pilot)) }}
                </span>
              </td>
              <td>
                {{ util.so }}%
                <span v-if="idx > 0" class="diff-badge"
                  :class="{ positive: parseFloat(util.so) > parseFloat(comparisonData.utilization[0].so) }">
                  {{ getDifference(parseFloat(comparisonData.utilization[0].so), parseFloat(util.so)) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comparison {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.save-section,
.saved-results-section,
.comparison-section {
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
}

h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 16px 0;
}

h4 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 12px 0;
}

.save-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.name-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
}

.name-input:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn.primary {
  background: var(--accent-blue);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn.primary:disabled {
  background: var(--border-color);
  color: var(--text-muted-color);
  cursor: not-allowed;
  opacity: 0.6;
}

.limit-message {
  margin-top: 8px;
  font-size: 0.85rem;
  color: #f59e0b;
  font-style: italic;
}

.no-results-message,
.empty-state {
  padding: 20px;
  text-align: center;
  color: var(--text-muted-color);
  font-style: italic;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 4px;
}

.saved-results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.saved-result-card {
  padding: 16px;
  background: var(--bg-color);
  border: 2px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.2s;
}

.saved-result-card.selected {
  border-color: var(--accent-blue);
  background: rgba(59, 130, 246, 0.05);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex: 1;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.result-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-color);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.result-name:hover {
  background: rgba(59, 130, 246, 0.1);
  color: var(--accent-blue);
}

.edit-name-container {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.edit-name-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--accent-blue);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.95rem;
  font-weight: 600;
  outline: none;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.btn-delete {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-muted-color);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
}

.btn-delete:hover {
  background: #ef4444;
  border-color: #ef4444;
  color: white;
}

.result-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
  font-size: 0.8rem;
  color: var(--text-muted-color);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.result-summary {
  display: flex;
  gap: 16px;
  font-size: 0.85rem;
  color: var(--text-color);
}

.summary-stat strong {
  color: var(--accent-blue);
  font-weight: 600;
}

.comparison-table {
  margin-bottom: 24px;
}

.comparison-table:last-child {
  margin-bottom: 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

thead {
  background: rgba(0, 0, 0, 0.05);
}

th {
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  color: var(--text-muted-color);
  border-bottom: 2px solid var(--border-color);
}

td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-color);
}

.name-cell {
  font-weight: 600;
  color: var(--accent-blue);
}

tbody tr:hover {
  background: rgba(59, 130, 246, 0.03);
}

.diff-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(148, 163, 184, 0.2);
  color: var(--text-muted-color);
}

.diff-badge.positive {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.diff-badge.negative {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}
</style>

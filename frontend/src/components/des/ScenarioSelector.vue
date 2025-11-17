<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { API_SIM_SCENARIOS, API_SIM_SCENARIO } from '../../constants'

interface Scenario {
  id: string
  name: string
  file: string
}

interface ScenarioContent {
  name?: string
  description?: string
  summary?: string
  questions?: string[]
  [key: string]: any
}

interface Props {
  loading?: boolean
}

interface Emits {
  (e: 'scenario-loaded', content: ScenarioContent): void
  (e: 'new-scenario'): void
  (e: 'run-scenario'): void
  (e: 'done'): void
}

withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<Emits>()

const scenarios = ref<Scenario[]>([])
const selectedScenario = ref<string>('')
const scenarioDescription = ref<string>('')
const statusMessage = ref<string>('')
const statusError = ref<boolean>(false)

// API Functions
async function listScenarios(): Promise<Scenario[]> {
  const response = await fetch(API_SIM_SCENARIOS)
  const data = await response.json()
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Failed to list scenarios')
  }
  return (data.scenarios || []).map((x: any) => {
    if (typeof x === 'string') {
      const id = x.replace(/\.json$/i, '')
      return { id, file: `${id}.json`, name: id }
    }
    return {
      id: x.id || (x.file || '').replace(/\.json$/i, ''),
      file: x.file || `${x.id}.json`,
      name: x.name || x.id
    }
  })
}

async function loadScenario(name: string): Promise<{ content: ScenarioContent }> {
  const url = new URL(API_SIM_SCENARIO, window.location.origin)
  if (name) url.searchParams.set('name', name)
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Failed to load scenario')
  }
  return data
}

// Event Handlers
async function handleScenarioChange() {
  if (!selectedScenario.value) return

  setStatus('Loading scenario…', false)
  try {
    const result = await loadScenario(selectedScenario.value)
    const content = result.content

    // Build description from content
    const desc = content.description || content.summary || ''
    const questions = Array.isArray(content.questions) ? content.questions.filter(Boolean) : []
    let fullDesc = desc
    if (questions.length) {
      fullDesc += (fullDesc ? ' — ' : '') + 'Answers: ' + questions.join(' • ')
    }
    scenarioDescription.value = fullDesc

    setStatus(`Loaded ${content.name || selectedScenario.value}`, false)
    emit('scenario-loaded', content)
  } catch (error) {
    setStatus((error as Error).message, true)
  }
}

async function handleNew() {
  emit('new-scenario')
  scenarioDescription.value = ''
  setStatus('New scenario created (unsaved)', false)
}

function handleRun() {
  emit('run-scenario')
}

function setStatus(message: string, isError: boolean) {
  statusMessage.value = message
  statusError.value = isError
}

// Initialize
async function refreshScenarioList(selectName?: string) {
  try {
    const list = await listScenarios()
    scenarios.value = list

    if (selectName && list.find((s) => s.id === selectName)) {
      selectedScenario.value = selectName
    } else if (list.length > 0 && list[0]) {
      selectedScenario.value = list[0].id
    }

    // Auto-load first scenario
    if (selectedScenario.value) {
      await handleScenarioChange()
    }
  } catch (error) {
    setStatus((error as Error).message, true)
  }
}

onMounted(() => {
  refreshScenarioList()
})
</script>

<template>
  <div class="scenario-selector">
    <div class="selector-row">
      <div class="form-field select-field">
        <label>Select:</label>
        <select v-model="selectedScenario" @change="handleScenarioChange" :disabled="loading">
          <option v-for="scenario in scenarios" :key="scenario.id" :value="scenario.id">
            {{ scenario.name }}
          </option>
        </select>
      </div>

      <div class="action-buttons">
        <button class="btn secondary" @click="handleNew" :disabled="loading">New</button>
        <button class="btn primary" @click="handleRun" :disabled="loading">Run</button>
        <button class="btn secondary" @click="$emit('done')" :disabled="loading">Done</button>
      </div>
    </div>

    <!-- Scenario Description -->
    <div v-if="scenarioDescription" class="scenario-description">
      {{ scenarioDescription }}
    </div>

    <!-- Status Message -->
    <div v-if="statusMessage" class="status-message" :class="{ error: statusError }">
      {{ statusMessage }}
    </div>
  </div>
</template>

<style scoped>
.scenario-selector {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.selector-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.select-field {
  flex: 1;
  min-width: 200px;
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

.form-field select {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
}

.form-field select:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.form-field select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent-blue);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn.secondary {
  background: var(--panel-color);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.btn.secondary:hover:not(:disabled) {
  background: var(--border-color);
}

.scenario-description {
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid var(--accent-blue);
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--text-color);
  line-height: 1.4;
}

.status-message {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--text-muted-color);
}

.status-message.error {
  color: var(--chart-red);
}
</style>

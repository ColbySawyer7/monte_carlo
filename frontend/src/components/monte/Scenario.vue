<script setup lang="ts">
// Monte Carlo Scenario component - based on DES Scenario but with iterations support
import { ref, onMounted, watch, nextTick, computed } from 'vue'
import { API_SIM_SCENARIOS, API_SIM_SCENARIO } from '../../constants'
import { MonteCarloConfigDefaults } from '../../views/sim/MonteCarloConfigDefaults'
import { extractEditableFields, getValueByPath, type ConfigField } from '../../views/sim/DESconfigIntrospection'

// Use shared state for scenario selection
const {
  selectedScenarioId,
  scenarioDescription: sharedScenarioDescription,
  scenarioCategory: sharedScenarioCategory,
  originalConfigHash: sharedOriginalConfigHash,
  saveToLocalStorage,
  simSettings
} = MonteCarloConfigDefaults()

// Click outside directive
const vClickOutside = {
  mounted(el: any, binding: any) {
    el.clickOutsideEvent = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value()
      }
    }
    document.addEventListener('click', el.clickOutsideEvent)
  },
  unmounted(el: any) {
    document.removeEventListener('click', el.clickOutsideEvent)
  }
}

interface Scenario {
  id: string
  name: string
  file: string
  isCustom?: boolean
}

interface StoredCustomScenario extends Scenario {
  config: any
}

interface ScenarioContent {
  name?: string
  category?: string
  description?: string
  summary?: string
  questions?: string[]
  [key: string]: any
}

interface Props {
  loading?: boolean
  currentConfig?: any
  hasUnsavedChanges?: boolean
}

interface Emits {
  (e: 'scenario-loaded', content: ScenarioContent, scenarioId?: string): void
  (e: 'new-scenario'): void
  (e: 'run-scenario'): void
  (e: 'update:hasUnsavedChanges', value: boolean): void
  (e: 'update:simulate-settings', settings: SimulateSetting[]): void
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<Emits>()

const scenarios = ref<Scenario[]>([])
// Use shared state for selectedScenario
const selectedScenario = selectedScenarioId
const scenarioDescription = sharedScenarioDescription
const scenarioCategory = sharedScenarioCategory
const originalConfigHash = sharedOriginalConfigHash
const statusMessage = ref<string>('')
const statusError = ref<boolean>(false)
const isDropdownOpen = ref<boolean>(false)
const hasUnsavedChanges = ref<boolean>(false)
const saveScenarioName = ref<string>('')

// Simulate Settings state
interface SimulateSetting {
  id: string
  fieldPath: string
  fieldPathArray: string[]
  defaultValue: any
  constraints: any
}

const simulateSettings = ref<SimulateSetting[]>([])
const loadedScenarioContent = ref<ScenarioContent | null>(null)

// Extract available fields from current config
const availableFields = computed(() => {
  if (!props.currentConfig) return []
  return extractEditableFields(props.currentConfig)
})

// Get fields that haven't been selected yet (for the add button check)
const availableFieldsForSelection = computed(() => {
  const selectedPaths = new Set(simulateSettings.value.map(s => s.fieldPath).filter(Boolean))
  return availableFields.value.filter(field => !selectedPaths.has(field.pathString))
})

// Add a new simulate setting
function addSimulateSetting() {
  const newId = `sim-${Date.now()}`
  simulateSettings.value.push({
    id: newId,
    fieldPath: '',
    fieldPathArray: [],
    defaultValue: null,
    constraints: null
  })
}

// Remove a simulate setting
function removeSimulateSetting(id: string) {
  const index = simulateSettings.value.findIndex(s => s.id === id)
  if (index !== -1) {
    simulateSettings.value.splice(index, 1)
  }
}

// Handle field selection for a simulate setting
function handleFieldSelection(settingId: string, fieldPath: string) {
  const setting = simulateSettings.value.find(s => s.id === settingId)
  if (!setting) return

  const field = availableFields.value.find(f => f.pathString === fieldPath)
  if (!field) return

  // Get default value from current config (which reflects the loaded scenario)
  // The currentConfig prop already has the transformed values from the scenario
  const defaultValue = getValueByPath(props.currentConfig, field.path)

  setting.fieldPath = fieldPath
  setting.fieldPathArray = field.path
  setting.defaultValue = defaultValue !== undefined ? defaultValue : field.currentValue
  setting.constraints = field.constraints
  
  // Emit update to parent
  emit('update:simulate-settings', [...simulateSettings.value])
}

// Watch for changes to simulateSettings and emit updates
watch(simulateSettings, () => {
  emit('update:simulate-settings', [...simulateSettings.value])
}, { deep: true })

// Calculate recommended iterations based on simulation settings
const recommendedIterations = computed(() => {
  // If no simulation settings, default to 5000
  const validSettings = simulateSettings.value.filter(s => 
    s.fieldPath && 
    s.constraints && 
    s.constraints.type === 'number' &&
    typeof s.constraints.min === 'number' &&
    typeof s.constraints.max === 'number' &&
    typeof s.constraints.step === 'number' &&
    s.constraints.step > 0
  )
  
  if (validSettings.length === 0) {
    return 5000
  }
  
  // Calculate total unique values across all settings
  let totalUniqueValues = 0
  
  for (const setting of validSettings) {
    const { min, max, step } = setting.constraints
    // Calculate number of unique values: (max - min) / step + 1
    const uniqueValues = Math.floor((max - min) / step) + 1
    totalUniqueValues += uniqueValues
  }
  
  // Multiply by 5x to encourage variability
  const recommended = totalUniqueValues * 5
  
  // Round up to nearest 100 for cleaner numbers
  return Math.ceil(recommended / 100) * 100
})

// Calculate total unique values across all simulation settings
function calculateTotalUniqueValues(): number {
  const validSettings = simulateSettings.value.filter(s => 
    s.fieldPath && 
    s.constraints && 
    s.constraints.type === 'number' &&
    typeof s.constraints.min === 'number' &&
    typeof s.constraints.max === 'number' &&
    typeof s.constraints.step === 'number' &&
    s.constraints.step > 0
  )
  
  if (validSettings.length === 0) {
    return 0
  }
  
  let total = 0
  for (const setting of validSettings) {
    const { min, max, step } = setting.constraints
    const uniqueValues = Math.floor((max - min) / step) + 1
    total += uniqueValues
  }
  
  return total
}

// Apply recommended iterations
function applyRecommendedIterations() {
  simSettings.value.iterations = recommendedIterations.value
}

// Store categories for all scenarios
const scenarioCategories = ref<Record<string, string>>({})

const CUSTOM_SCENARIOS_KEY = 'monteCarloCustomScenarios'
const MAX_CUSTOM_SCENARIOS = 6

// Simple hash function for config comparison
function hashConfig(config: any): string {
  if (!config) return ''
  try {
    return JSON.stringify(config)
  } catch {
    return ''
  }
}

// Local Storage Functions
function getCustomScenarios(): StoredCustomScenario[] {
  try {
    const stored = localStorage.getItem(CUSTOM_SCENARIOS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveCustomScenario(name: string, config: any) {
  const customScenarios = getCustomScenarios()
  const id = `custom-${Date.now()}`

  const scenarioWithConfig: StoredCustomScenario = {
    id,
    name,
    file: '',
    isCustom: true,
    config
  }

  customScenarios.unshift(scenarioWithConfig)

  // Keep only the last MAX_CUSTOM_SCENARIOS
  if (customScenarios.length > MAX_CUSTOM_SCENARIOS) {
    customScenarios.splice(MAX_CUSTOM_SCENARIOS)
  }

  localStorage.setItem(CUSTOM_SCENARIOS_KEY, JSON.stringify(customScenarios))
  return scenarioWithConfig
}

function updateCustomScenario(id: string, config: any) {
  const customScenarios = getCustomScenarios()
  const index = customScenarios.findIndex(s => s.id === id)

  if (index !== -1 && customScenarios[index]) {
    customScenarios[index].config = config
    localStorage.setItem(CUSTOM_SCENARIOS_KEY, JSON.stringify(customScenarios))
  }
}

function deleteCustomScenario(id: string) {
  const customScenarios = getCustomScenarios()
  const filtered = customScenarios.filter(s => s.id !== id)
  localStorage.setItem(CUSTOM_SCENARIOS_KEY, JSON.stringify(filtered))
}

function loadCustomScenario(id: string): ScenarioContent | null {
  const customScenarios = getCustomScenarios()
  const scenario = customScenarios.find(s => s.id === id)
  return scenario?.config || null
}

// Transform frontend config format to API format for consistent loading
function transformToApiFormat(config: any): any {
  const transformed: any = {}

  // Transform process times
  if (config.processTimes) {
    transformed.process_times = {
      preflight: { value_hours: config.processTimes.preflight || 0 },
      postflight: { value_hours: config.processTimes.postflight || 0 },
      turnaround: { value_hours: config.processTimes.turnaround || 0 },
      hold_crew_during_process_times: config.processTimes.hold_crew_during_process_times || false,
      mount_times: {}
    }
    if (config.processTimes.mountTimes) {
      Object.entries(config.processTimes.mountTimes).forEach(([key, value]) => {
        transformed.process_times.mount_times[key] = { value_hours: value }
      })
    }
  }

  // Transform sim settings (including iterations for Monte Carlo)
  if (config.simSettings) {
    transformed.horizon_hours = config.simSettings.horizonHours
    transformed.constraints = {
      queueing: config.simSettings.queueing || 'reject_if_unavailable'
    }
    transformed.unit_policy = {
      mission_split: {
        'VMU-1': (config.simSettings.unitSplit?.vmu1 || 50) / 100,
        'VMU-3': (config.simSettings.unitSplit?.vmu3 || 50) / 100
      }
    }
    // Preserve custom scenario specific fields including iterations
    transformed.simSettings = {
      enableOverrides: config.simSettings.enableOverrides,
      overrides: config.simSettings.overrides,
      iterations: config.simSettings.iterations || 5000
    }
  }

  // Transform mission types
  if (config.missionTypes && Array.isArray(config.missionTypes)) {
    transformed.mission_types = config.missionTypes.map((mt: any) => {
      const result: any = {
        name: mt.name,
        priority: mt.priority,
        required_aircrew: {
          pilot: mt.pilotReq,
          so: mt.soReq,
          intel: mt.intelReq || 0
        },
        required_payload_types: mt.requiredPayloads || []
      }

      // Transform flight time
      if (mt.flightTime?.type === 'deterministic') {
        result.flight_time = {
          type: 'deterministic',
          value_hours: mt.flightTime.value,
          transit_in_hours: mt.flightTime.transit_in || 0,
          transit_out_hours: mt.flightTime.transit_out || 0
        }
      } else {
        result.flight_time = {
          type: 'triangular',
          a: mt.flightTime?.a || 2,
          m: mt.flightTime?.m || 3,
          b: mt.flightTime?.b || 4,
          transit_in_hours: mt.flightTime?.transit_in || 0,
          transit_out_hours: mt.flightTime?.transit_out || 0
        }
      }

      if (mt.crew_rotation) {
        result.crew_rotation = mt.crew_rotation
      }

      return result
    })
  }

  // Transform demand
  if (config.demand && Array.isArray(config.demand)) {
    transformed.demand = config.demand.map((d: any) => {
      if (d.type === 'deterministic') {
        return {
          mission_type: d.missionType,
          type: 'deterministic',
          every_hours: d.everyHours,
          start_at_hours: d.startAtHours
        }
      } else {
        return {
          mission_type: d.missionType,
          type: 'poisson',
          rate_per_hour: d.ratePerHour
        }
      }
    })
  }

  // Transform duty requirements
  if (config.dutyRequirements) {
    transformed.duty_requirements = config.dutyRequirements
  }

  // Transform personnel availability
  if (config.personnelAvailability) {
    transformed.personnel_availability = config.personnelAvailability
  }

  return transformed
}

// Watch for config changes
watch(
  () => props.currentConfig,
  (newConfig) => {
    if (!selectedScenario.value || !originalConfigHash.value) {
      hasUnsavedChanges.value = false
      emit('update:hasUnsavedChanges', false)
      return
    }

    const currentHash = hashConfig(newConfig)
    const hasChanges = currentHash !== originalConfigHash.value
    hasUnsavedChanges.value = hasChanges
    emit('update:hasUnsavedChanges', hasChanges)
  },
  { deep: true }
)

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
    // Check if it's a custom scenario
    const scenario = scenarios.value.find(s => s.id === selectedScenario.value)

    if (scenario?.isCustom) {
      const content = loadCustomScenario(selectedScenario.value)
      if (!content) {
        throw new Error('Custom scenario not found')
      }

      scenarioDescription.value = content.description || content.summary || 'Custom saved scenario'
      scenarioCategory.value = 'Custom'
      scenarioCategories.value[selectedScenario.value] = 'Custom'

      // Store loaded scenario content for simulate settings
      loadedScenarioContent.value = content

      setStatus(`Loaded ${scenario.name}`, false)
      emit('scenario-loaded', content, selectedScenario.value)
    } else {
      // Load from API
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
      scenarioCategory.value = content.category || ''

      // Store category for this scenario
      if (content.category) {
        scenarioCategories.value[selectedScenario.value] = content.category
      }

      // Store loaded scenario content for simulate settings
      loadedScenarioContent.value = content

      setStatus(`Loaded ${content.name || selectedScenario.value}`, false)
      emit('scenario-loaded', content, selectedScenario.value)
    }

    // Store original config hash for change detection AFTER emitting
    // This ensures the parent component updates first
    await nextTick()
    originalConfigHash.value = hashConfig(props.currentConfig)
    hasUnsavedChanges.value = false
    emit('update:hasUnsavedChanges', false)

    // Save scenario selection to localStorage
    saveToLocalStorage()
  } catch (error) {
    setStatus((error as Error).message, true)
  }
}

async function handleReset() {
  selectedScenario.value = ''
  scenarioDescription.value = ''
  scenarioCategory.value = ''
  isDropdownOpen.value = false
  originalConfigHash.value = ''
  hasUnsavedChanges.value = false
  emit('update:hasUnsavedChanges', false)
  setStatus('Reset to default settings', false)
  emit('new-scenario')
}

async function handleReloadScenario() {
  if (!selectedScenario.value) return

  setStatus('Reloading scenario…', false)
  try {
    await handleScenarioChange()
  } catch (error) {
    setStatus((error as Error).message, true)
  }
}

function handleRun() {
  emit('run-scenario')
}

function handleSave() {
  if (!props.currentConfig) {
    setStatus('No configuration to save', true)
    return
  }

  // Transform config to API format before saving
  const configToSave = transformToApiFormat(props.currentConfig)

  // Check if current scenario is a custom one
  const currentScenario = scenarios.value.find(s => s.id === selectedScenario.value)

  // If a name is provided in the save input, always create a new scenario
  if (saveScenarioName.value.trim()) {
    // Create new custom scenario - check if max reached
    const customScenarios = getCustomScenarios()
    if (customScenarios.length >= MAX_CUSTOM_SCENARIOS) {
      setStatus(`Maximum of ${MAX_CUSTOM_SCENARIOS} custom scenarios reached. Delete one to save a new one.`, true)
      return
    }

    const name = saveScenarioName.value.trim()
    const newScenario = saveCustomScenario(name, configToSave)
    setStatus(`Saved "${name}"`, false)
    saveScenarioName.value = ''

    // Refresh the scenario list and select the new scenario
    refreshScenarioList(newScenario.id)
  } else if (currentScenario?.isCustom && hasUnsavedChanges.value) {
    // Update existing custom scenario only if there are changes and no new name provided
    updateCustomScenario(currentScenario.id, configToSave)
    setStatus(`Updated "${currentScenario.name}"`, false)
    originalConfigHash.value = hashConfig(props.currentConfig)
    hasUnsavedChanges.value = false
    emit('update:hasUnsavedChanges', false)
  } else {
    // Create new custom scenario with auto-generated name
    const customScenarios = getCustomScenarios()
    if (customScenarios.length >= MAX_CUSTOM_SCENARIOS) {
      setStatus(`Maximum of ${MAX_CUSTOM_SCENARIOS} custom scenarios reached. Delete one to save a new one.`, true)
      return
    }

    const name = `Custom ${customScenarios.length + 1}`
    const newScenario = saveCustomScenario(name, configToSave)
    setStatus(`Saved "${name}"`, false)
    saveScenarioName.value = ''

    // Refresh the scenario list and select the new scenario
    refreshScenarioList(newScenario.id)
  }
}

function handleDelete(scenarioId: string, event: Event) {
  event.stopPropagation()

  const scenario = scenarios.value.find(s => s.id === scenarioId)
  if (!scenario) return

  deleteCustomScenario(scenarioId)

  // If the deleted scenario was selected, clear selection
  if (selectedScenario.value === scenarioId) {
    handleReset()
  }

  // Refresh the list
  refreshScenarioList()
  setStatus(`Deleted "${scenario.name}"`, false)
}

function selectScenario(scenarioId: string) {
  selectedScenario.value = scenarioId
  isDropdownOpen.value = false
  handleScenarioChange()
}

function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value
}

function closeDropdown() {
  isDropdownOpen.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (props.loading) return

  const currentIndex = scenarios.value.findIndex(s => s.id === selectedScenario.value)

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (isDropdownOpen.value) {
      // Navigate down in open dropdown
      const nextIndex = (currentIndex + 1) % scenarios.value.length
      if (scenarios.value[nextIndex]) {
        selectScenario(scenarios.value[nextIndex].id)
      }
    } else {
      // Navigate down when closed
      const nextIndex = (currentIndex + 1) % scenarios.value.length
      if (scenarios.value[nextIndex]) {
        selectedScenario.value = scenarios.value[nextIndex].id
        handleScenarioChange()
      }
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (isDropdownOpen.value) {
      // Navigate up in open dropdown
      const prevIndex = currentIndex - 1 < 0 ? scenarios.value.length - 1 : currentIndex - 1
      if (scenarios.value[prevIndex]) {
        selectScenario(scenarios.value[prevIndex].id)
      }
    } else {
      // Navigate up when closed
      const prevIndex = currentIndex - 1 < 0 ? scenarios.value.length - 1 : currentIndex - 1
      if (scenarios.value[prevIndex]) {
        selectedScenario.value = scenarios.value[prevIndex].id
        handleScenarioChange()
      }
    }
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleDropdown()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeDropdown()
  }
}

function setStatus(message: string, isError: boolean) {
  statusMessage.value = message
  statusError.value = isError
}

// Initialize
async function refreshScenarioList(selectName?: string) {
  try {
    const list = await listScenarios()

    // Add custom scenarios from local storage
    const customScenarios = getCustomScenarios()
    const customScenarioList: Scenario[] = customScenarios.map(s => ({
      id: s.id,
      name: s.name,
      file: '',
      isCustom: true
    }))

    scenarios.value = [...customScenarioList, ...list]

    // Preload categories for all scenarios (skip custom ones)
    for (const scenario of list) {
      try {
        const result = await loadScenario(scenario.id)
        if (result.content.category) {
          scenarioCategories.value[scenario.id] = result.content.category
        }
      } catch (e) {
        // Ignore errors for individual scenario loads
      }
    }

    // Set category for custom scenarios
    customScenarioList.forEach(s => {
      scenarioCategories.value[s.id] = 'Custom'
    })

    if (selectName && scenarios.value.find((s) => s.id === selectName)) {
      selectedScenario.value = selectName
      await handleScenarioChange()
    }
    // Don't auto-select any scenario on initial load
  } catch (error) {
    setStatus((error as Error).message, true)
  }
}

onMounted(async () => {
  await refreshScenarioList()

  // Selection and originalConfigHash already restored from localStorage via composable
  // Check for unsaved changes on mount
  if (selectedScenario.value && originalConfigHash.value) {
    await nextTick()
    const currentHash = hashConfig(props.currentConfig)
    const hasChanges = currentHash !== originalConfigHash.value
    hasUnsavedChanges.value = hasChanges
    emit('update:hasUnsavedChanges', hasChanges)
  }
})
</script>

<template>
  <div class="scenario-selector">
    <!-- Header Section -->
    <div class="scenario-header">
      <div class="header-left">
        <h3>Scenario</h3>
        <span v-if="hasUnsavedChanges" class="unsaved-changes-badge">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          changes detected in current scenario...
        </span>
      </div>
      <div class="action-buttons">
        <button class="btn btn-icon primary" @click="handleRun" :disabled="loading" title="Run simulation">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>
        <button class="btn btn-icon success" @click="handleSave"
          :disabled="loading || !currentConfig || (scenarios.find(s => s.id === selectedScenario)?.isCustom && !hasUnsavedChanges && !saveScenarioName.trim()) || (!scenarios.find(s => s.id === selectedScenario)?.isCustom && !saveScenarioName.trim() && getCustomScenarios().length >= MAX_CUSTOM_SCENARIOS)"
          :title="saveScenarioName.trim() ? 'Save as new custom scenario' : scenarios.find(s => s.id === selectedScenario)?.isCustom && hasUnsavedChanges ? 'Update custom scenario' : getCustomScenarios().length >= MAX_CUSTOM_SCENARIOS ? `Maximum ${MAX_CUSTOM_SCENARIOS} custom scenarios reached` : 'Save as new custom scenario'">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
        </button>
        <button class="btn btn-icon secondary" @click="handleReloadScenario"
          :disabled="loading || !selectedScenario || !hasUnsavedChanges" title="Reset current scenario">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
        <button class="btn btn-icon secondary" @click="handleReset" :disabled="loading"
          title="Clear all and reset to defaults">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>

    <div class="selector-row">
      <div class="form-field select-field">
        <label>Select:</label>
        <div class="custom-select" :class="{ open: isDropdownOpen }" v-click-outside="closeDropdown"
          @keydown="handleKeydown" tabindex="0">
          <div class="select-trigger" @click="toggleDropdown" :class="{ disabled: loading }">
            <span class="selected-text">
              {{
                scenarios.find(s => s.id === selectedScenario)?.name ||
                'Select a prebuilt scenario, or run the current configuration...'
              }}
              <span v-if="hasUnsavedChanges && selectedScenario" class="modified-indicator">*</span>
            </span>
            <span v-if="scenarioCategory" class="category-badge" :class="`badge-${scenarioCategory.toLowerCase()}`">
              {{ scenarioCategory }}
            </span>
            <span class="arrow">▼</span>
          </div>
          <div v-show="isDropdownOpen" class="select-dropdown">
            <div v-for="scenario in scenarios" :key="scenario.id" class="select-option"
              :class="{ selected: scenario.id === selectedScenario }" @click="selectScenario(scenario.id)">
              <span class="option-text">{{ scenario.name }}</span>
              <button v-if="scenario.isCustom" class="btn-delete" @click="handleDelete(scenario.id, $event)"
                title="Delete custom scenario">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
              <span v-if="scenarioCategories[scenario.id]" class="category-badge"
                :class="`badge-${(scenarioCategories[scenario.id] || '').toLowerCase()}`">
                {{ scenarioCategories[scenario.id] }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Save Name Input -->
      <div class="form-field save-name-field">
        <label>Save as:</label>
        <input v-model="saveScenarioName" type="text" placeholder="Enter name (optional)..." class="save-name-input"
          :disabled="loading" @keyup.enter="handleSave" />
      </div>
    </div>

    <!-- Iterations Field (Monte Carlo specific) - Moved to its own row -->
    <div class="iterations-row">
      <div class="form-field iterations-field">
        <label>Iterations:</label>
        <div class="iterations-input-wrapper">
          <select 
            v-model="simSettings.iterations" 
            :disabled="loading" 
            class="iterations-select">
            <option :value="1000">1,000 (Standard)</option>
            <option :value="5000">5,000 (Detailed)</option>
            <option :value="50000">50,000 (Very High Precision)</option>
            <option :value="1000000">1,000,000 (Maximum Precision)</option>
            <option v-if="recommendedIterations > 0 && recommendedIterations !== 1000 && recommendedIterations !== 5000 && recommendedIterations !== 50000 && recommendedIterations !== 1000000" :value="recommendedIterations">
              {{ recommendedIterations.toLocaleString() }} (Recommended)
            </option>
          </select>
          <button 
            v-if="recommendedIterations !== simSettings.iterations"
            class="apply-recommendation-btn" 
            @click="applyRecommendedIterations"
            :disabled="loading"
            :title="`Apply recommended ${recommendedIterations.toLocaleString()} iterations based on your simulation settings`">
            Use Recommended ({{ recommendedIterations.toLocaleString() }})
          </button>
        </div>
        <div class="iterations-explanation">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            <template v-if="simulateSettings.length > 0">
              <strong>Recommended:</strong> {{ recommendedIterations.toLocaleString() }} iterations 
              ({{ simulateSettings.length }} setting{{ simulateSettings.length > 1 ? 's' : '' }} with {{ calculateTotalUniqueValues().toLocaleString() }} unique value{{ calculateTotalUniqueValues() !== 1 ? 's' : '' }} × 5x for variability)
            </template>
            <template v-else>
              <strong>Default:</strong> 5,000 iterations recommended for standard Monte Carlo analysis
            </template>
          </span>
        </div>
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

    <!-- Simulate Settings Section -->
    <div class="simulate-settings-section">
      <div class="simulate-settings-header">
        <h4>Simulate Settings</h4>
        <button 
          class="btn btn-icon secondary add-setting-btn" 
          @click="addSimulateSetting"
          :disabled="loading || availableFieldsForSelection.length === 0"
          title="Add a setting to simulate"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div v-if="simulateSettings.length === 0" class="no-settings-message">
        <p>Click the "+" button to add settings to simulate across Monte Carlo iterations.</p>
      </div>

      <div v-else class="simulate-settings-list">
        <div 
          v-for="setting in simulateSettings" 
          :key="setting.id" 
          class="simulate-setting-item"
        >
          <div class="setting-controls">
            <div class="form-field setting-field-select">
              <label>Setting:</label>
              <select 
                :value="setting.fieldPath" 
                @change="handleFieldSelection(setting.id, ($event.target as HTMLSelectElement).value)"
                :disabled="loading"
                class="setting-select"
              >
                <option value="">-- Select a setting --</option>
                <option 
                  v-for="field in availableFields" 
                  :key="field.pathString"
                  :value="field.pathString"
                  :disabled="simulateSettings.some(s => s.id !== setting.id && s.fieldPath === field.pathString)"
                >
                  {{ field.constraints.label || field.pathString }}
                  <template v-if="field.constraints.unit"> ({{ field.constraints.unit }})</template>
                </option>
              </select>
            </div>

            <div v-if="setting.fieldPath && setting.constraints" class="setting-info">
              <div class="info-row">
                <span class="info-label">Default:</span>
                <span class="info-value">{{ setting.defaultValue }}</span>
                <span v-if="setting.constraints.unit" class="info-unit">{{ setting.constraints.unit }}</span>
              </div>
              <div v-if="setting.constraints.type === 'number'" class="info-row">
                <span class="info-label">Range:</span>
                <span class="info-value">{{ setting.constraints.min }} - {{ setting.constraints.max }}</span>
                <span v-if="setting.constraints.step" class="info-step">(step: {{ setting.constraints.step }})</span>
              </div>
            </div>

            <button 
              class="btn btn-icon secondary remove-setting-btn" 
              @click="removeSimulateSetting(setting.id)"
              :disabled="loading"
              title="Remove this setting"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scenario-selector {
  margin-bottom: 16px;
}

.scenario-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.scenario-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
}

.unsaved-changes-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid #f59e0b;
  border-radius: 4px;
  font-size: 0.7rem;
  color: #f59e0b;
  font-weight: 600;
}

.unsaved-changes-badge svg {
  flex-shrink: 0;
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

.iterations-row {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.iterations-field {
  width: 100%;
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

.apply-recommendation-btn {
  padding: 6px 12px;
  background: var(--accent-blue);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.apply-recommendation-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.apply-recommendation-btn:disabled {
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

.iterations-explanation {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(59, 130, 246, 0.05);
  border-left: 2px solid var(--accent-blue);
  border-radius: 3px;
  font-size: 0.75rem;
  color: var(--text-muted-color);
  line-height: 1.3;
}

.iterations-explanation svg {
  flex-shrink: 0;
  color: var(--accent-blue);
}

.save-name-field {
  min-width: 200px;
}

.save-name-input {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
}

.save-name-input:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.save-name-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Custom Select Dropdown */
.custom-select {
  position: relative;
  width: 100%;
}

.custom-select:focus {
  outline: none;
}

.custom-select:focus .select-trigger {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.select-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.select-trigger:hover:not(.disabled) {
  border-color: var(--accent-blue);
}

.select-trigger.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.selected-text {
  flex: 1;
  font-size: 0.9rem;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
}

.modified-indicator {
  color: #f59e0b;
  font-weight: bold;
  font-size: 1.2rem;
  line-height: 1;
}

.arrow {
  font-size: 0.7rem;
  color: var(--text-muted-color);
  transition: transform 0.2s;
}

.custom-select.open .arrow {
  transform: rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.select-option:hover {
  background: rgba(59, 130, 246, 0.1);
}

.select-option.selected {
  background: rgba(59, 130, 246, 0.15);
  font-weight: 500;
}

.option-text {
  flex: 1;
  font-size: 0.9rem;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.category-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  background: var(--border-color);
  color: var(--text-color);
}

.badge-demo {
  background: #3b82f6;
  color: white;
}

.badge-smoke {
  background: #6d6d6d;
  color: white;
}

.badge-staffing {
  background: #f59e0b;
  color: white;
}

.badge-analysis {
  background: #8b5cf6;
  color: white;
}

.badge-custom {
  background: #10b981;
  color: white;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn.btn-icon {
  padding: 8px;
  width: 36px;
  height: 33px;
}

.btn.btn-icon svg {
  flex-shrink: 0;
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

.btn.success {
  background: #10b981;
  color: white;
}

.btn.success:hover:not(:disabled) {
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

.btn-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--chart-red);
  opacity: 0;
  transition: all 0.2s;
}

.select-option:hover .btn-delete {
  opacity: 1;
}

.btn-delete:hover {
  background: rgba(239, 68, 68, 0.1);
}

.btn-delete svg {
  flex-shrink: 0;
}

/* Simulate Settings Section */
.simulate-settings-section {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 2px solid var(--border-color);
}

.simulate-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.simulate-settings-header h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
}

.add-setting-btn {
  padding: 6px;
  width: 32px;
  height: 32px;
}

.no-settings-message {
  padding: 16px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  text-align: center;
  color: var(--text-muted-color);
  font-size: 0.85rem;
  font-style: italic;
}

.simulate-settings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.simulate-setting-item {
  padding: 12px;
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.setting-controls {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.setting-field-select {
  flex: 1;
  min-width: 250px;
}

.setting-select {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.9rem;
  width: 100%;
}

.setting-select:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.setting-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.setting-info {
  flex: 1;
  min-width: 200px;
  padding: 8px;
  background: rgba(59, 130, 246, 0.05);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.info-label {
  font-weight: 600;
  color: var(--text-muted-color);
}

.info-value {
  color: var(--text-color);
  font-family: monospace;
}

.info-unit {
  color: var(--text-muted-color);
  font-size: 0.8rem;
}

.info-step {
  color: var(--text-muted-color);
  font-size: 0.75rem;
  font-style: italic;
}

.remove-setting-btn {
  padding: 6px;
  width: 32px;
  height: 32px;
  color: var(--chart-red);
}

.remove-setting-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
}

@media (max-width: 768px) {
  .setting-controls {
    flex-direction: column;
  }

  .setting-field-select,
  .setting-info {
    width: 100%;
  }
}
</style>



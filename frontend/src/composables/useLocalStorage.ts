/**
 * Centralized localStorage composable for DES and Monte Carlo simulation state
 * 
 * This composable provides a unified interface for all localStorage operations,
 * ensuring consistent error handling and type safety across the application.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface ConfigState {
  processTimes: any
  simSettings: any
  missionTypes: any
  demand: any
  dutyRequirements: any
  personnelAvailability: any
  hasLoadedScenario: boolean
  currentScenarioName: string
}

export interface ResultState {
  simulationResults: any | null
  resultsScenarioName: string
  resultsTimestamp: string
}

export interface SelectionState {
  selectedScenarioId: string
  scenarioDescription: string
  scenarioCategory: string
  originalConfigHash: string
}

export interface CustomScenario {
  id: string
  name: string
  file: string
  isCustom: true
  config: any
}

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_KEYS = {
  // Config state
  desConfig: 'desScenarioState',
  monteConfig: 'monteCarloScenarioState',

  // Results state
  desResults: 'desResults',
  monteResults: 'monteCarloResults',

  // Selection state
  desSelection: 'desScenarioSelection',
  monteSelection: 'monteCarloScenarioSelection',

  // Custom scenarios
  desCustomScenarios: 'desCustomScenarios',
  monteCustomScenarios: 'monteCarloCustomScenarios'
} as const

// ============================================================================
// Core Storage Functions
// ============================================================================

/**
 * Generic save function with error handling
 */
export function save<T>(key: string, data: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data))
    return true
  } catch (error) {
    console.error(`Failed to save to localStorage [${key}]:`, error)
    return false
  }
}

/**
 * Generic load function with error handling
 */
export function load<T>(key: string): T | null {
  try {
    const saved = localStorage.getItem(key)
    if (!saved) return null
    return JSON.parse(saved) as T
  } catch (error) {
    console.error(`Failed to load from localStorage [${key}]:`, error)
    return null
  }
}

/**
 * Remove item from localStorage
 */
export function remove(key: string): boolean {
  try {
    localStorage.removeItem(key)
    return true
  } catch (error) {
    console.error(`Failed to remove from localStorage [${key}]:`, error)
    return false
  }
}

// ============================================================================
// Config State Functions
// ============================================================================

export function saveConfig(mode: 'des' | 'monte', config: ConfigState): boolean {
  const key = mode === 'des' ? STORAGE_KEYS.desConfig : STORAGE_KEYS.monteConfig
  return save(key, config)
}

export function loadConfig(mode: 'des' | 'monte'): ConfigState | null {
  const key = mode === 'des' ? STORAGE_KEYS.desConfig : STORAGE_KEYS.monteConfig
  return load<ConfigState>(key)
}

// ============================================================================
// Results State Functions
// ============================================================================

export function saveResults(mode: 'des' | 'monte', results: ResultState): boolean {
  const key = mode === 'des' ? STORAGE_KEYS.desResults : STORAGE_KEYS.monteResults
  return save(key, results)
}

export function loadResults(mode: 'des' | 'monte'): ResultState | null {
  const key = mode === 'des' ? STORAGE_KEYS.desResults : STORAGE_KEYS.monteResults
  const state = load<ResultState>(key)

  // Ensure Monte Carlo results have iterations property
  if (state && mode === 'monte' && state.simulationResults && !state.simulationResults.iterations) {
    return {
      ...state,
      simulationResults: {
        ...state.simulationResults,
        iterations: 5000 // Default fallback
      }
    }
  }

  return state
}

// ============================================================================
// Selection State Functions
// ============================================================================

export function saveSelection(mode: 'des' | 'monte', selection: SelectionState): boolean {
  const key = mode === 'des' ? STORAGE_KEYS.desSelection : STORAGE_KEYS.monteSelection
  return save(key, selection)
}

export function loadSelection(mode: 'des' | 'monte'): SelectionState | null {
  const key = mode === 'des' ? STORAGE_KEYS.desSelection : STORAGE_KEYS.monteSelection
  return load<SelectionState>(key)
}

export function clearSelection(mode: 'des' | 'monte'): boolean {
  const key = mode === 'des' ? STORAGE_KEYS.desSelection : STORAGE_KEYS.monteSelection
  return remove(key)
}

// ============================================================================
// Custom Scenarios Functions
// ============================================================================

export function getCustomScenarios(mode: 'des' | 'monte'): CustomScenario[] {
  const key = mode === 'des' ? STORAGE_KEYS.desCustomScenarios : STORAGE_KEYS.monteCustomScenarios
  return load<CustomScenario[]>(key) || []
}

export function saveCustomScenarios(mode: 'des' | 'monte', scenarios: CustomScenario[]): boolean {
  const key = mode === 'des' ? STORAGE_KEYS.desCustomScenarios : STORAGE_KEYS.monteCustomScenarios
  return save(key, scenarios)
}

export function addCustomScenario(mode: 'des' | 'monte', name: string, config: any, maxScenarios: number = 6): CustomScenario | null {
  const scenarios = getCustomScenarios(mode)

  if (scenarios.length >= maxScenarios) {
    console.warn(`Maximum of ${maxScenarios} custom scenarios reached`)
    return null
  }

  const newScenario: CustomScenario = {
    id: `custom-${Date.now()}`,
    name,
    file: '',
    isCustom: true,
    config
  }

  scenarios.unshift(newScenario)

  // Keep only the last maxScenarios
  if (scenarios.length > maxScenarios) {
    scenarios.splice(maxScenarios)
  }

  const success = saveCustomScenarios(mode, scenarios)
  return success ? newScenario : null
}

export function updateCustomScenario(mode: 'des' | 'monte', id: string, config: any): boolean {
  const scenarios = getCustomScenarios(mode)
  const index = scenarios.findIndex(s => s.id === id)

  if (index === -1 || !scenarios[index]) {
    console.warn(`Custom scenario not found: ${id}`)
    return false
  }

  scenarios[index].config = config
  return saveCustomScenarios(mode, scenarios)
}

export function deleteCustomScenario(mode: 'des' | 'monte', id: string): boolean {
  const scenarios = getCustomScenarios(mode)
  const filtered = scenarios.filter(s => s.id !== id)
  return saveCustomScenarios(mode, filtered)
}

export function loadCustomScenario(mode: 'des' | 'monte', id: string): any | null {
  const scenarios = getCustomScenarios(mode)
  const scenario = scenarios.find(s => s.id === id)
  return scenario?.config || null
}

// ============================================================================
// Combined Save/Load Functions
// ============================================================================

/**
 * Save complete DES state (config + results)
 * For backward compatibility with existing DES implementation
 */
export function saveDESState(config: ConfigState, results: ResultState): boolean {
  const combinedState = {
    ...config,
    ...results
  }
  return save(STORAGE_KEYS.desConfig, combinedState)
}

/**
 * Load complete DES state (config + results)
 * For backward compatibility with existing DES implementation
 */
export function loadDESState(): { config: ConfigState; results: ResultState } | null {
  const state = load<any>(STORAGE_KEYS.desConfig)
  if (!state) return null

  return {
    config: {
      processTimes: state.processTimes,
      simSettings: state.simSettings,
      missionTypes: state.missionTypes,
      demand: state.demand,
      dutyRequirements: state.dutyRequirements,
      personnelAvailability: state.personnelAvailability,
      hasLoadedScenario: state.hasLoadedScenario ?? false,
      currentScenarioName: state.currentScenarioName || 'New Scenario'
    },
    results: {
      simulationResults: state.simulationResults || null,
      resultsScenarioName: state.resultsScenarioName || '',
      resultsTimestamp: state.resultsTimestamp || ''
    }
  }
}

/**
 * Save complete Monte state (config + separate results)
 */
export function saveMonteState(config: ConfigState, results: ResultState): boolean {
  const configSuccess = saveConfig('monte', config)
  const resultsSuccess = saveResults('monte', results)
  return configSuccess && resultsSuccess
}

/**
 * Load complete Monte state (config + separate results)
 */
export function loadMonteState(): { config: ConfigState | null; results: ResultState | null } {
  return {
    config: loadConfig('monte'),
    results: loadResults('monte')
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clear all storage for a specific mode
 */
export function clearAllStorage(mode: 'des' | 'monte'): boolean {
  const keys = mode === 'des'
    ? [STORAGE_KEYS.desConfig, STORAGE_KEYS.desResults, STORAGE_KEYS.desSelection, STORAGE_KEYS.desCustomScenarios]
    : [STORAGE_KEYS.monteConfig, STORAGE_KEYS.monteResults, STORAGE_KEYS.monteSelection, STORAGE_KEYS.monteCustomScenarios]

  let success = true
  for (const key of keys) {
    if (!remove(key)) {
      success = false
    }
  }
  return success
}

/**
 * Get storage size for debugging
 */
export function getStorageSize(mode?: 'des' | 'monte'): { key: string; size: number }[] {
  const keys = mode === 'des'
    ? [STORAGE_KEYS.desConfig, STORAGE_KEYS.desResults, STORAGE_KEYS.desSelection, STORAGE_KEYS.desCustomScenarios]
    : mode === 'monte'
      ? [STORAGE_KEYS.monteConfig, STORAGE_KEYS.monteResults, STORAGE_KEYS.monteSelection, STORAGE_KEYS.monteCustomScenarios]
      : Object.values(STORAGE_KEYS)

  return keys.map(key => {
    const item = localStorage.getItem(key)
    return {
      key,
      size: item ? new Blob([item]).size : 0
    }
  })
}

// ============================================================================
// Export Composable
// ============================================================================

export function useLocalStorage() {
  return {
    // Generic helpers
    save,
    load,
    remove,

    // Config operations
    saveConfig,
    loadConfig,

    // Results operations
    saveResults,
    loadResults,

    // Selection operations
    saveSelection,
    loadSelection,
    clearSelection,

    // Custom scenarios operations
    getCustomScenarios,
    saveCustomScenarios,
    addCustomScenario,
    updateCustomScenario,
    deleteCustomScenario,
    loadCustomScenario,

    // Combined operations
    saveDESState,
    loadDESState,
    saveMonteState,
    loadMonteState,

    // Utility operations
    clearAllStorage,
    getStorageSize
  }
}

import { API_APP_STATE } from './constants'

// cachedState holds the loaded state to avoid redundant fetches
let cachedState: State | null = null

// a StateTable represents a table with fields and rows
export interface StateTable {
  fields: string[]
  rows: Record<string, any>[]
}

// a State represents the overall application state
export interface State {
  app: { version: string | null }
  tables: { [tableKey: string]: StateTable }
}

// loadState fetches the application state from the backend API
export async function loadState(): Promise<State> {
  if (cachedState) return cachedState
  const response = await fetch(API_APP_STATE)
  if (!response.ok) {
    throw new Error(`Failed to load data: ${response.statusText}`)
  }
  const data = await response.json()
  cachedState = data
  return data
}

// getTable retrieves a specific table from the application state
export async function getTable(tableKey: string): Promise<StateTable> {
  const state = await loadState()
  return state.tables[tableKey] || { fields: [], rows: [] }
}

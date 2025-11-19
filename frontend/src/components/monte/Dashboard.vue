<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import ProcessTimes from '../des/ProcessTimes.vue'
import SimSettings from './SimSettings.vue'
import ScenarioSelector from './ScenarioSelector.vue'
import MissionTypes from '../des/MissionTypes.vue'
import Demand from '../des/Demand.vue'
import SettingsPreview from '../des/SettingsPreview.vue'
import Results from './Results.vue'
import { loadState, type State } from '../../state'
import { API_SIM_MONTE_RUN } from '../../constants'

// Current scenario name
const currentScenarioName = ref<string>('New Scenario')

// Simulation results
const simulationResults = ref<any>(null)
const resultsScenarioName = ref<string>('')
const resultsTimestamp = ref<string>('')
const isRunning = ref(false)

// Store original override values from state API
const originalOverrides = ref({
  vmu1: {
    aircraft: 0,
    pilot: 0,
    so: 0,
    skyTower: 0,
    ewPod: 0,
    smartSensor: 0,
    extendedRange: 0
  },
  vmu3: {
    aircraft: 0,
    pilot: 0,
    so: 0,
    skyTower: 0,
    ewPod: 0,
    smartSensor: 0,
    extendedRange: 0
  }
})

// Mission Types State
const missionTypes = ref<Array<{
  name: string
  priority: number
  pilotReq: number
  soReq: number
  requiredPayloads: string[]
  flightTime: { type: 'triangular'; a: number; m: number; b: number } | { type: 'deterministic'; value: number }
}>>([
  {
    name: 'MIR',
    priority: 2,
    pilotReq: 1,
    soReq: 1,
    requiredPayloads: [] as string[],
    flightTime: { type: 'triangular' as const, a: 3, m: 4, b: 6 }
  }
])

// Demand State
const demand = ref<Array<{
  missionType: string
  type: 'poisson' | 'deterministic'
  ratePerHour?: number
  everyHours?: number
  startAtHours?: number
}>>([
  {
    missionType: 'MIR',
    type: 'poisson' as const,
    ratePerHour: 2.0
  }
])

// Computed list of mission type names for the demand component
const availableMissionTypes = computed(() => {
  return missionTypes.value.map((mt: { name: string }) => mt.name).filter(Boolean)
})

// Handler for when mission types change (name changes or removals)
function handleMissionTypesChanged() {
  const validMissionTypes = new Set<string>(availableMissionTypes.value)

  // Filter out demand entries that reference mission types that no longer exist
  demand.value = demand.value.filter((d: { missionType: string }) =>
    validMissionTypes.has(d.missionType)
  )
}

// Process Times State
const processTimes = ref({
  preflight: 0.75,
  postflight: 0.5,
  turnaround: 0.25,
  mountTimes: {
    'SkyTower II': 0,
    'EW Pod': 0,
    'SmartSensor': 0,
    'Extended Range Tank': 0
  }
})

// TODO: Add toggle state for showing/hiding percentile timelines
// const showPercentileTimelines = ref(false)

// Simulation Settings State
const simSettings = ref({
  horizonHours: 24,
  queueing: 'reject_if_unavailable',
  iterations: 5000,
  enableOverrides: false,
  overrides: {
    vmu1: {
      aircraft: 0,
      pilot: 0,
      so: 0,
      skyTower: 0,
      ewPod: 0,
      smartSensor: 0,
      extendedRange: 0
    },
    vmu3: {
      aircraft: 0,
      pilot: 0,
      so: 0,
      skyTower: 0,
      ewPod: 0,
      smartSensor: 0,
      extendedRange: 0
    }
  },
  unitSplit: {
    vmu1: 50,
    vmu3: 50
  }
})

// Watch for enableOverrides changes to restore original values when disabled
watch(
  () => simSettings.value.enableOverrides,
  (newValue: boolean) => {
    if (!newValue) {
      // Restore original values when overrides are disabled
      simSettings.value.overrides.vmu1 = { ...originalOverrides.value.vmu1 }
      simSettings.value.overrides.vmu3 = { ...originalOverrides.value.vmu3 }
    }
  }
)

// Load override defaults from state API
async function loadOverrideDefaults() {
  try {
    const state: State = await loadState()
    if (!state?.tables) return

    const acRows = state.tables['v_aircraft']?.rows || []
    const staffRows = state.tables['v_staffing']?.rows || []
    const payloadRows = state.tables['v_unit_payload_readiness']?.rows || []

    // Count aircraft by unit (FMC only)
    function aircraftCount(unit: string): number {
      let count = 0
      for (const row of acRows) {
        if ((row['Unit'] || row['Unit Name']) === unit && row['Status'] === 'FMC') {
          count++
        }
      }
      return count
    }

    // Count crew by unit and MOS
    function crewCounts(unit: string): { pilot: number; so: number } {
      let pilot = 0
      let so = 0
      for (const row of staffRows) {
        const u = row['Unit Name']
        const mos = row['MOS Number']
        if (u !== unit) continue
        if (mos === '7318') pilot++
        if (mos === '7314') so++
      }
      return { pilot, so }
    }

    // Count payloads by unit and type
    function payloadCounts(unit: string) {
      const rows = payloadRows.filter((x) => x['Unit'] === unit)
      const out = { skyTower: 0, ewPod: 0, smartSensor: 0, extendedRange: 0 }
      for (const row of rows) {
        const type = row['Payload Type'] || row['Type']
        const count = Number(row['FMC Count'] || row['FMC'] || 0)
        if (type === 'SkyTower II') out.skyTower = count
        else if (type === 'EW Pod') out.ewPod = count
        else if (type === 'SmartSensor') out.smartSensor = count
        else if (type === 'Extended Range Tank') out.extendedRange = count
      }
      return out
    }

    const vmu1Data = {
      aircraft: aircraftCount('VMU-1'),
      ...crewCounts('VMU-1'),
      ...payloadCounts('VMU-1')
    }

    const vmu3Data = {
      aircraft: aircraftCount('VMU-3'),
      ...crewCounts('VMU-3'),
      ...payloadCounts('VMU-3')
    }

    // Store original values
    originalOverrides.value.vmu1 = { ...vmu1Data }
    originalOverrides.value.vmu3 = { ...vmu3Data }

    // Update override defaults
    simSettings.value.overrides.vmu1 = vmu1Data
    simSettings.value.overrides.vmu3 = vmu3Data
  } catch (error) {
    console.error('Failed to load override defaults from state:', error)
  }
}

// Scenario Handlers
function handleScenarioLoaded(content: any) {
  currentScenarioName.value = content.name || 'Loaded Scenario'

  // Populate process times
  if (content.process_times) {
    const pt = content.process_times
    if (pt.preflight?.value_hours !== undefined) {
      processTimes.value.preflight = pt.preflight.value_hours
    }
    if (pt.postflight?.value_hours !== undefined) {
      processTimes.value.postflight = pt.postflight.value_hours
    }
    if (pt.turnaround?.value_hours !== undefined) {
      processTimes.value.turnaround = pt.turnaround.value_hours
    }

    // Reset all mount times to 0 first, then apply scenario values
    processTimes.value.mountTimes = {
      'SkyTower II': 0,
      'EW Pod': 0,
      'SmartSensor': 0,
      'Extended Range Tank': 0
    }

    if (pt.mount_times) {
      Object.entries(pt.mount_times).forEach(([key, value]: [string, any]) => {
        if (value?.value_hours !== undefined) {
          processTimes.value.mountTimes[key as keyof typeof processTimes.value.mountTimes] = value.value_hours
        }
      })
    }
  }

  // Populate sim settings
  if (content.horizon_hours !== undefined) {
    simSettings.value.horizonHours = content.horizon_hours
  }
  if (content.constraints?.queueing) {
    simSettings.value.queueing = content.constraints.queueing
  }
  if (content.unit_policy?.mission_split) {
    const split = content.unit_policy.mission_split
    simSettings.value.unitSplit.vmu1 = Math.round((split['VMU-1'] || 0) * 100)
    simSettings.value.unitSplit.vmu3 = Math.round((split['VMU-3'] || 0) * 100)
  }

  // Populate mission types
  if (content.mission_types && Array.isArray(content.mission_types)) {
    missionTypes.value = content.mission_types.map((mt: any) => {
      // Parse flight time based on type
      let flightTime
      if (mt.flight_time?.type === 'deterministic') {
        flightTime = {
          type: 'deterministic' as const,
          value: mt.flight_time.value_hours || 0
        }
      } else {
        // Default to triangular
        flightTime = {
          type: 'triangular' as const,
          a: mt.flight_time?.a || 2,
          m: mt.flight_time?.m || 3,
          b: mt.flight_time?.b || 4
        }
      }

      return {
        name: mt.name || 'Mission',
        priority: mt.priority || 1,
        pilotReq: mt.required_aircrew?.pilot || 1,
        soReq: mt.required_aircrew?.so || 1,
        requiredPayloads: mt.required_payload_types || [],
        flightTime
      }
    })
    handleMissionTypesChanged()
  }

  // Populate demand
  if (content.demand && Array.isArray(content.demand)) {
    demand.value = content.demand.map((d: any) => {
      if (d.type === 'deterministic') {
        return {
          missionType: d.mission_type || 'MIR',
          type: 'deterministic' as const,
          everyHours: d.every_hours || 1,
          startAtHours: d.start_at_hours || 0
        }
      } else {
        return {
          missionType: d.mission_type || 'MIR',
          type: 'poisson' as const,
          ratePerHour: d.rate_per_hour || 1
        }
      }
    })
  }
}

function handleNewScenario() {
  currentScenarioName.value = 'New Scenario'

  // Reset to defaults
  missionTypes.value = [
    {
      name: 'MIR',
      priority: 2,
      pilotReq: 1,
      soReq: 1,
      requiredPayloads: [],
      flightTime: { type: 'triangular', a: 3, m: 4, b: 6 }
    }
  ]
  handleMissionTypesChanged()

  demand.value = [
    {
      missionType: 'MIR',
      type: 'poisson',
      ratePerHour: 2.0
    }
  ]

  processTimes.value = {
    preflight: 0.75,
    postflight: 0.5,
    turnaround: 0.25,
    mountTimes: {
      'SkyTower II': 0,
      'EW Pod': 0,
      'SmartSensor': 0,
      'Extended Range Tank': 0
    }
  }

  simSettings.value.horizonHours = 24
  simSettings.value.queueing = 'reject_if_unavailable'
  simSettings.value.iterations = 5000
  simSettings.value.unitSplit = { vmu1: 50, vmu3: 50 }
}

async function handleRunScenario() {
  isRunning.value = true
  simulationResults.value = null

  try {
    // Load current state
    const state = await loadState()

    // Build scenario payload
    const scenario = {
      name: currentScenarioName.value,
      horizon_hours: simSettings.value.horizonHours,
      constraints: {
        queueing: simSettings.value.queueing
      },
      unit_policy: {
        assignment: 'by_unit',
        mission_split: {
          'VMU-1': simSettings.value.unitSplit.vmu1 / 100,
          'VMU-3': simSettings.value.unitSplit.vmu3 / 100
        }
      },
      demand: demand.value.map((d: { missionType: string; type: 'poisson' | 'deterministic'; ratePerHour?: number; everyHours?: number; startAtHours?: number }) => {
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
      }),
      mission_types: missionTypes.value.map((mt: { name: string; priority: number; pilotReq: number; soReq: number; requiredPayloads: string[]; flightTime: { type: 'triangular'; a: number; m: number; b: number } | { type: 'deterministic'; value: number } }) => ({
        name: mt.name,
        priority: mt.priority,
        required_aircrew: {
          pilot: mt.pilotReq,
          so: mt.soReq
        },
        required_payload_types: mt.requiredPayloads,
        flight_time: mt.flightTime.type === 'deterministic'
          ? { type: 'deterministic', value_hours: mt.flightTime.value }
          : { type: 'triangular', a: mt.flightTime.a, m: mt.flightTime.m, b: mt.flightTime.b }
      })),
      process_times: {
        preflight: { value_hours: processTimes.value.preflight },
        postflight: { value_hours: processTimes.value.postflight },
        turnaround: { value_hours: processTimes.value.turnaround },
        mount_times: (() => {
          const result: Record<string, { value_hours: number }> = {}
          for (const key in processTimes.value.mountTimes) {
            result[key] = { value_hours: processTimes.value.mountTimes[key] }
          }
          return result
        })()
      }
    }

    // Build overrides if enabled
    let overrides = null
    if (simSettings.value.enableOverrides) {
      overrides = {
        units: {
          'VMU-1': {
            aircraft: simSettings.value.overrides.vmu1.aircraft,
            pilot: simSettings.value.overrides.vmu1.pilot,
            so: simSettings.value.overrides.vmu1.so,
            payload_by_type: {
              'SkyTower II': simSettings.value.overrides.vmu1.skyTower,
              'EW Pod': simSettings.value.overrides.vmu1.ewPod,
              'SmartSensor': simSettings.value.overrides.vmu1.smartSensor,
              'Extended Range Tank': simSettings.value.overrides.vmu1.extendedRange
            }
          },
          'VMU-3': {
            aircraft: simSettings.value.overrides.vmu3.aircraft,
            pilot: simSettings.value.overrides.vmu3.pilot,
            so: simSettings.value.overrides.vmu3.so,
            payload_by_type: {
              'SkyTower II': simSettings.value.overrides.vmu3.skyTower,
              'EW Pod': simSettings.value.overrides.vmu3.ewPod,
              'SmartSensor': simSettings.value.overrides.vmu3.smartSensor,
              'Extended Range Tank': simSettings.value.overrides.vmu3.extendedRange
            }
          }
        }
      }
    }

    // POST to /api/sim/monte/run
    const response = await fetch(API_SIM_MONTE_RUN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        scenario, 
        state, 
        overrides,
        iterations: simSettings.value.iterations,
        keepIterations: false
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || response.statusText)
    }

    const data = await response.json()
    simulationResults.value = data.results
    resultsScenarioName.value = currentScenarioName.value
    resultsTimestamp.value = new Date().toLocaleString()
  } catch (error) {
    console.error('Failed to run Monte Carlo simulation:', error)
    alert(`Failed to run Monte Carlo simulation: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    isRunning.value = false
  }
}

onMounted(() => {
  loadOverrideDefaults()
})
</script>

<template>
  <div class="monte-container">
    <!-- Page Header -->
    <div class="section-header">
      <h2>MONTE CARLO SIMULATION</h2>
      <p class="section-desc">
        Purpose: run multiple DES iterations with random sampling to understand variability and uncertainty in outcomes.<br>
        Benefits: provides statistical distributions (mean, percentiles, confidence intervals) for key metrics; quantifies risk and uncertainty.<br>
        Best use: when you need to understand the range of possible outcomes, assess confidence levels, and make risk-informed decisions based on aggregated statistics.
      </p>
    </div>

    <!-- Main Layout: Left (Scenario) + Right (Settings Preview) -->
    <div class="monte-layout">
      <!-- Left Section: Scenario Editor -->
      <div class="scenario-section">
        <div class="section-card">
          <h3>Scenario</h3>

          <!-- Scenario Selector -->
          <ScenarioSelector @scenario-loaded="handleScenarioLoaded" @new-scenario="handleNewScenario"
            @run-scenario="handleRunScenario" :iterations="simSettings.iterations"
            @update:iterations="(val: number) => simSettings.iterations = val" />
          <ProcessTimes v-model="processTimes" />
          <SimSettings v-model="simSettings" />
          <MissionTypes v-model="missionTypes" @mission-types-changed="handleMissionTypesChanged" />
          <Demand v-model="demand" :available-mission-types="availableMissionTypes" />
        </div>
      </div>

      <!-- Right Section: Settings Preview and Results -->
      <div class="preview-section">
        <div class="section-card">
          <h3>Settings Preview</h3>
          <SettingsPreview :unit-split="simSettings.unitSplit" :queueing="simSettings.queueing"
            :mission-types="missionTypes" :demand="demand" :process-times="processTimes"
            :results="null" />
        </div>

        <div class="section-card results-card">
          <div class="results-header">
            <h3>Results</h3>
            <div v-if="simulationResults" class="results-meta">
              <span class="results-scenario-name">{{ resultsScenarioName }}</span>
              <span class="results-timestamp">{{ resultsTimestamp }}</span>
            </div>
          </div>
          <div v-if="isRunning" class="running-indicator">
            <div class="spinner"></div>
            <p>Running Monte Carlo simulation ({{ simSettings.iterations }} iterations)...</p>
          </div>
          <!-- TODO: Add checkbox/toggle above Results to show/hide percentile timelines -->
          <!-- Pass showPercentileTimelines prop to Results component when implemented -->
          <Results v-else :results="simulationResults" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.monte-container {
  padding: 20px;
  max-width: 1800px;
  margin: 0 auto;
}

.section-header {
  margin-bottom: 24px;
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

.monte-layout {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 16px;
  align-items: start;
}

.section-card {
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.section-card h3 {
  margin: 0 0 16px 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.results-header h3 {
  margin: 0;
  padding: 0;
  border: none;
}

.results-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.results-scenario-name {
  font-size: 0.9rem;
  color: var(--text-muted-color);
  font-style: italic;
}

.results-timestamp {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-family: monospace;
}

.results-card {
  margin-top: 16px;
}

.running-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 16px;
}

.running-indicator p {
  color: var(--text-muted-color);
  font-style: italic;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(59, 130, 246, 0.2);
  border-top-color: var(--accent-blue);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1200px) {
  .monte-layout {
    grid-template-columns: 1fr;
  }
}
</style>


<script setup lang="ts">
import { computed } from 'vue'

interface MissionType {
  name: string
  priority: number
  pilotReq: number
  soReq: number
  requiredPayloads: string[]
  flightTime: any
}

interface DemandEntry {
  missionType: string
  type: 'poisson' | 'deterministic'
  ratePerHour?: number
  everyHours?: number
  startAtHours?: number
}

interface ProcessTimes {
  preflight: number
  postflight: number
  turnaround: number
  mountTimes: Record<string, number>
}

interface Props {
  unitSplit: { vmu1: number; vmu3: number }
  queueing: string
  missionTypes: MissionType[]
  demand: DemandEntry[]
  processTimes: ProcessTimes
  results?: any
}

const props = defineProps<Props>()

// Calculate normalized unit split percentages
const unitSplitPercent = computed(() => {
  const total = props.unitSplit.vmu1 + props.unitSplit.vmu3
  if (total === 0) return { vmu1: 50, vmu3: 50 }
  return {
    vmu1: Math.round((props.unitSplit.vmu1 / total) * 100),
    vmu3: Math.round((props.unitSplit.vmu3 / total) * 100)
  }
})

// Format demand display string
function formatDemand(demandEntries: DemandEntry[]): string {
  if (demandEntries.length === 0) return '—'

  const parts = demandEntries.map(d => {
    if (d.type === 'poisson') {
      return `${d.ratePerHour}/hr`
    } else if (d.type === 'deterministic') {
      const every = d.everyHours || 1
      const start = d.startAtHours ?? 0
      return `every ${every}hr @${start}h`
    }
    return ''
  }).filter(Boolean)

  return parts.join(', ')
}

// Calculate demand and process times per mission type
const missionSummary = computed(() => {
  const missions = props.missionTypes.map(mt => {
    // Find demand for this mission type
    const demandEntries = props.demand.filter(d => d.missionType === mt.name)

    // Calculate expected demand rate (convert deterministic to approximate rate)
    let demandRate = 0
    demandEntries.forEach(d => {
      if (d.type === 'poisson') {
        demandRate += d.ratePerHour || 0
      } else if (d.type === 'deterministic' && d.everyHours) {
        demandRate += 1 / d.everyHours
      }
    })

    // Calculate individual time components
    const preflightTime = props.processTimes.preflight
    const postflightTime = props.processTimes.postflight
    const turnaroundTime = props.processTimes.turnaround

    // Calculate total mount time
    let mountTime = 0
    mt.requiredPayloads.forEach(payload => {
      mountTime += props.processTimes.mountTimes[payload] || 0
    })

    // Calculate flight time (use mode/value depending on type)
    let flightTime = 0
    if (mt.flightTime.type === 'deterministic') {
      flightTime = mt.flightTime.value || 0
    } else if (mt.flightTime.type === 'triangular') {
      flightTime = mt.flightTime.m || 0 // Use mode as estimate
    }

    const processTime = preflightTime + mountTime + flightTime + postflightTime + turnaroundTime

    return {
      name: mt.name,
      demandDisplay: formatDemand(demandEntries),
      demandRate: demandRate.toFixed(2),
      processTime: processTime,
      totalHours: processTime.toFixed(2),
      isTriangularFlight: mt.flightTime.type === 'triangular',
      // Individual segment times
      preflightTime,
      mountTime,
      flightTime,
      postflightTime,
      turnaroundTime
    }
  })

  // Find max process time for scaling
  const maxProcessTime = Math.max(...missions.map(m => m.processTime), 0.01)

  // Add scaled width percentage, segment percentages, and results data
  return missions.map(m => {
    const total = m.processTime || 0.01

    // Get results for this mission type if available
    const resultsForType = props.results?.by_type?.[m.name]
    const requested = resultsForType?.requested ?? '—'
    const started = resultsForType?.started ?? '—'
    const completed = resultsForType?.completed ?? '—'
    const rejected = resultsForType?.rejected ?? '—'

    return {
      ...m,
      processTimeDisplay: m.processTime.toFixed(2),
      barWidthPercent: (m.processTime / maxProcessTime) * 100,
      // Calculate flex basis for each segment (proportional to time)
      preflightFlex: m.preflightTime / total,
      mountFlex: m.mountTime / total,
      flightFlex: m.flightTime / total,
      postflightFlex: m.postflightTime / total,
      turnaroundFlex: m.turnaroundTime / total,
      // Results data
      requested,
      started,
      completed,
      rejected
    }
  })
})

const policyDisplay = computed(() => {
  const map: Record<string, string> = {
    'reject_if_unavailable': 'reject_if_unavailable',
    'queue': 'queue',
    'wait': 'wait'
  }
  return map[props.queueing] || props.queueing
})
</script>

<template>
  <div class="settings-preview">
    <!-- Top Row: Unit Split + Policy -->
    <div class="preview-row top-row">
      <div class="preview-section-inline half">
        <div class="section-title-inline">Unit Split</div>
        <div class="unit-split-viz">
          <div class="split-bar-display">
            <div class="split-segment vmu1" :style="{ width: unitSplitPercent.vmu1 + '%' }">
              <span class="split-label">VMU-1 {{ unitSplitPercent.vmu1 }}%</span>
            </div>
            <div class="split-segment vmu3" :style="{ width: unitSplitPercent.vmu3 + '%' }">
              <span class="split-label">VMU-3 {{ unitSplitPercent.vmu3 }}%</span>
            </div>
          </div>
        </div>
      </div>

      <div class="preview-section-inline half">
        <div class="section-title-inline">Policy</div>
        <div class="policy-display">
          {{ policyDisplay }}
        </div>
      </div>
    </div>

    <!-- Bottom Row: Combined Demand/Process/Results Table -->
    <div class="preview-row">
      <div class="preview-section full">
        <div class="section-title">Mission Summary</div>
        <table class="summary-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Demand</th>
              <th>Process</th>
              <th>Total</th>
              <th>Requested</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Rejected</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="mission in missionSummary" :key="mission.name">
              <td class="mission-name">{{ mission.name }}</td>
              <td class="demand-cell">
                <span class="demand-text">{{ mission.demandDisplay }}</span>
              </td>
              <td class="process-viz">
                <div class="process-bar-container">
                  <div class="process-bar" :style="{ width: mission.barWidthPercent + '%' }">
                    <div v-if="mission.preflightTime > 0" class="bar-segment preflight"
                      :style="{ flex: mission.preflightFlex }"
                      :title="`Preflight: ${mission.preflightTime.toFixed(2)}h`"></div>
                    <div v-if="mission.mountTime > 0" class="bar-segment mount" :style="{ flex: mission.mountFlex }"
                      :title="`Mount: ${mission.mountTime.toFixed(2)}h`"></div>
                    <div v-if="mission.flightTime > 0" class="bar-segment flight" :style="{ flex: mission.flightFlex }"
                      :title="`Flight: ${mission.flightTime.toFixed(2)}h`">
                      <span v-if="mission.isTriangularFlight" class="triangular-indicator">m</span>
                    </div>
                    <div v-if="mission.postflightTime > 0" class="bar-segment postflight"
                      :style="{ flex: mission.postflightFlex }"
                      :title="`Postflight: ${mission.postflightTime.toFixed(2)}h`"></div>
                    <div v-if="mission.turnaroundTime > 0" class="bar-segment turnaround"
                      :style="{ flex: mission.turnaroundFlex }"
                      :title="`Turnaround: ${mission.turnaroundTime.toFixed(2)}h`"></div>
                  </div>
                </div>
              </td>
              <td class="total-hours">{{ mission.totalHours }} hrs</td>
              <td class="result-cell">{{ mission.requested }}</td>
              <td class="result-cell">{{ mission.started }}</td>
              <td class="result-cell">{{ mission.completed }}</td>
              <td class="result-cell">{{ mission.rejected }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.preview-row.top-row {
  gap: 24px;
  margin-bottom: 8px;
}

.preview-section {
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.preview-section-inline {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preview-section.half {
  min-height: 120px;
}

.preview-section.full {
  grid-column: 1 / -1;
}

.section-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 12px;
  color: var(--text-color);
}

.section-title-inline {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-color);
  white-space: nowrap;
  min-width: 80px;
}

/* Unit Split Visualization */
.unit-split-viz {
  flex: 1;
}

.split-bar-display {
  display: flex;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.split-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 0.3s ease;
}

.split-segment.vmu1 {
  background: linear-gradient(to right, #4a90e2, #5ba3f5);
}

.split-segment.vmu3 {
  background: linear-gradient(to right, #7b68ee, #9b88ff);
}

.split-label {
  color: white;
  font-weight: 600;
  font-size: 0.85rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

/* Policy Display */
.policy-display {
  flex: 1;
  padding: 6px 12px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--text-color);
}

/* Summary Table */
.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.summary-table th,
.summary-table td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.summary-table th {
  font-weight: 600;
  color: var(--text-muted-color);
  background: rgba(0, 0, 0, 0.02);
  font-size: 0.8rem;
}

.summary-table td {
  color: var(--text-color);
}

.mission-name {
  font-weight: 600;
}

.result-cell {
  text-align: center;
  font-family: monospace;
  color: var(--text-color);
}

.demand-text {
  color: var(--text-muted-color);
  font-style: italic;
}

.process-viz {
  width: 40%;
}

.process-bar-container {
  width: 100%;
  height: 20px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 3px;
  overflow: hidden;
}

.process-bar {
  display: flex;
  height: 100%;
  border-radius: 3px;
  overflow: hidden;
}

.bar-segment {
  /* flex basis will be set dynamically based on time proportion */
  min-width: 2px;
  /* Ensure very small segments are still visible */
}

.bar-segment.preflight {
  background: #60a5fa;
}

.bar-segment.mount {
  background: #a78bfa;
}

.bar-segment.flight {
  background: #34d399;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.triangular-indicator {
  color: black;
  font-weight: 700;
  font-size: 0.7rem;
  font-style: italic;
}

.bar-segment.postflight {
  background: #fbbf24;
}

.bar-segment.turnaround {
  background: #9ca3af;
}

.total-hours {
  font-weight: 600;
  text-align: right;
  font-family: monospace;
}

.no-data {
  padding: 20px;
  text-align: center;
  color: var(--text-muted-color);
  font-style: italic;
  font-size: 0.85rem;
}
</style>

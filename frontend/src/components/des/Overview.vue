<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { computed } from 'vue'

interface MissionType {
  name: string
  priority: number
  pilotReq: number
  soReq: number
  intelReq: number
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
  hold_crew_during_process_times?: boolean
  mountTimes: Record<string, number>
}

interface Props {
  unitSplit: { vmu1: number; vmu3: number }
  queueing: string
  missionTypes: MissionType[]
  demand: DemandEntry[]
  processTimes: ProcessTimes
  horizonHours: number
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

// Calculate estimated mission counts per unit
const estimatedMissions = computed(() => {
  // Calculate total expected missions across all demand entries
  let totalMissions = 0
  props.demand.forEach(d => {
    if (d.type === 'poisson' && d.ratePerHour) {
      totalMissions += d.ratePerHour * props.horizonHours
    } else if (d.type === 'deterministic' && d.everyHours) {
      const startAt = d.startAtHours ?? 0
      const effectiveHorizon = props.horizonHours - startAt
      if (effectiveHorizon > 0) {
        totalMissions += Math.ceil(effectiveHorizon / d.everyHours)
      }
    }
  })

  // Apply unit split to get per-unit estimates
  const total = props.unitSplit.vmu1 + props.unitSplit.vmu3
  if (total === 0) {
    return { vmu1: 0, vmu3: 0, total: 0 }
  }

  const vmu1Missions = Math.round(totalMissions * (props.unitSplit.vmu1 / total))
  const vmu3Missions = Math.round(totalMissions * (props.unitSplit.vmu3 / total))

  return {
    vmu1: vmu1Missions,
    vmu3: vmu3Missions,
    total: Math.round(totalMissions)
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
    let transitInTime = 0
    let transitOutTime = 0

    if (mt.flightTime.type === 'deterministic') {
      flightTime = mt.flightTime.value || 0
      transitInTime = mt.flightTime.transit_in || 0
      transitOutTime = mt.flightTime.transit_out || 0
    } else if (mt.flightTime.type === 'triangular') {
      flightTime = mt.flightTime.m || 0 // Use mode as estimate
      transitInTime = mt.flightTime.transit_in || 0
      transitOutTime = mt.flightTime.transit_out || 0
    }

    const totalFlightTime = transitInTime + flightTime + transitOutTime
    const processTime = preflightTime + mountTime + totalFlightTime + postflightTime + turnaroundTime

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
      transitInTime,
      flightTime,
      transitOutTime,
      totalFlightTime,
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
      transitInFlex: m.transitInTime / total,
      flightFlex: m.flightTime / total,
      transitOutFlex: m.transitOutTime / total,
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
  <div class="overview">
    <h3>Configuration Overview</h3>
    <div class="settings-overview">
      <!-- Top Row: Unit Split + Policy -->
      <div class="overview-row top-row">
        <div class="unit-split-section">
          <div class="unit-split-header">
            <div class="section-title-inline">Unit Split</div>
            <div class="split-bar-display">
              <div class="split-segment vmu1" :style="{ width: unitSplitPercent.vmu1 + '%' }">
                <span class="split-label">VMU-1 {{ unitSplitPercent.vmu1 }}%</span>
              </div>
              <div class="split-segment vmu3" :style="{ width: unitSplitPercent.vmu3 + '%' }">
                <span class="split-label">VMU-3 {{ unitSplitPercent.vmu3 }}%</span>
              </div>
            </div>
          </div>
          <div class="bottom-row">
            <div class="mission-estimate">
              <span class="estimate-label">Estimated missions:</span>
              <span class="estimate-value">VMU-1: {{ estimatedMissions.vmu1 }}</span>
              <span class="estimate-separator">|</span>
              <span class="estimate-value">VMU-3: {{ estimatedMissions.vmu3 }}</span>
              <span class="estimate-separator">|</span>
              <span class="estimate-total">Total: {{ estimatedMissions.total }}</span>
            </div>
            <div class="policy-section">
              <div class="section-title-inline">Policy</div>
              <div class="policy-display">
                {{ policyDisplay }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Row: Combined Demand/Process/Results Table -->
      <div class="overview-row">
        <div class="overview-section full">
          <div class="section-title">Mission Summary</div>
          <div class="table-wrapper">
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
                        <div v-if="mission.transitInTime > 0" class="bar-segment transit_in"
                          :style="{ flex: mission.transitInFlex }"
                          :title="`Transit In: ${mission.transitInTime.toFixed(2)}h`"></div>
                        <div v-if="mission.flightTime > 0" class="bar-segment flight"
                          :style="{ flex: mission.flightFlex }"
                          :title="`On Station: ${mission.flightTime.toFixed(2)}h`">
                          <span v-if="mission.isTriangularFlight" class="triangular-indicator">m</span>
                        </div>
                        <div v-if="mission.transitOutTime > 0" class="bar-segment transit_out"
                          :style="{ flex: mission.transitOutFlex }"
                          :title="`Transit Out: ${mission.transitOutTime.toFixed(2)}h`"></div>
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
    </div>
  </div>
</template>

<style scoped>
.settings-overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overview-row {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overview-row.top-row {
  gap: 0;
  margin-bottom: 8px;
}

.unit-split-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.unit-split-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bottom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.policy-section {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.overview-section {
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.overview-section.full {
  border: none;
  background: transparent;
  padding: 0;
}

.overview-section-inline {
  display: flex;
  align-items: center;
  gap: 12px;
}

.overview-section.half {
  min-height: 120px;
}

.overview-section.full {
  width: 100%;
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
.unit-split-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.unit-split-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.unit-split-viz {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.split-bar-display {
  display: flex;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  flex: 1;
}

.split-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 0.3s ease;
  overflow: hidden;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mission-estimate {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--text-muted-color);
  padding: 4px 0;
}

.estimate-label {
  font-weight: 500;
}

.estimate-value {
  font-family: monospace;
  color: var(--text-color);
}

.estimate-separator {
  color: var(--border-color);
}

.estimate-total {
  font-family: monospace;
  font-weight: 600;
  color: var(--text-color);
}

/* Policy Display */
.policy-display {
  padding: 6px 12px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--text-color);
  white-space: nowrap;
}

/* Summary Table */
.table-wrapper {
  height: 145px;
  overflow-y: auto;
  padding: 0;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  table-layout: fixed;
}

.summary-table th,
.summary-table td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
  height: 15px;
}

.summary-table th:nth-child(1),
.summary-table td:nth-child(1) {
  width: 10%;
}

.summary-table th:nth-child(2),
.summary-table td:nth-child(2) {
  width: 12%;
}

.summary-table th:nth-child(3),
.summary-table td:nth-child(3) {
  width: 35%;
}

.summary-table th:nth-child(4),
.summary-table td:nth-child(4) {
  width: 10%;
}

.summary-table th:nth-child(5),
.summary-table td:nth-child(5),
.summary-table th:nth-child(6),
.summary-table td:nth-child(6),
.summary-table th:nth-child(7),
.summary-table td:nth-child(7),
.summary-table th:nth-child(8),
.summary-table td:nth-child(8) {
  width: 8.25%;
  text-align: center;
  vertical-align: middle;
}

.summary-table th {
  font-weight: 600;
  color: var(--text-muted-color);
  background: var(--bg-color);
  font-size: 0.8rem;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 1px 0 0 var(--border-color);
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

.bar-segment.transit_in {
  background: #059669;
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

.bar-segment.transit_out {
  background: #059669;
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

.overview h3 {
  margin: 0 0 16px 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}
</style>

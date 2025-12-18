<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { computed } from 'vue'

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
    aircraft_stats: {
      total: number
      used: number
      unused: number
      utilization: number
      utilizationPercent: number
      efficiency: number
      efficiencyPercent: number
      busyHours: number
      allocations: number
      denials: number
    }
    pilot: number
    pilot_efficiency: number
    pilot_stats: {
      total: number
      rawTotal: number
      effectiveTotal: number
      used: number
      busy: number
      idle: number
      unavailable: number
      utilization: number
      busyPercent: number
      idlePercent: number
      unavailablePercent: number
      trueForceUtilization: number
      busyHours: number
      allocations: number
      denials: number
    }
    so: number
    so_efficiency: number
    so_stats: {
      total: number
      rawTotal: number
      effectiveTotal: number
      used: number
      busy: number
      idle: number
      unavailable: number
      utilization: number
      busyPercent: number
      idlePercent: number
      unavailablePercent: number
      trueForceUtilization: number
      busyHours: number
      allocations: number
      denials: number
    }
    intel: number
    intel_efficiency: number
    intel_stats: {
      total: number
      rawTotal: number
      effectiveTotal: number
      used: number
      busy: number
      idle: number
      unavailable: number
      utilization: number
      busyPercent: number
      idlePercent: number
      unavailablePercent: number
      trueForceUtilization: number
      busyHours: number
      allocations: number
      denials: number
    }
    availability_factors?: {
      pilot: number
      so: number
      intel: number
    }
    initial_crew?: {
      pilot: number
      so: number
      intel: number
    }
    effective_crew?: {
      pilot: number
      so: number
      intel: number
    }
    peak_concurrent?: {
      aircraft: number
      pilot: number
      so: number
      intel: number
    }
  }>
  initial_resources?: {
    units: string[]
    aircraftByUnit: Record<string, number>
    staffingByUnit: Record<string, { pilot: number; so: number; intel: number }>
    payloadByUnit: Record<string, Record<string, number>>
    overrides_applied: boolean
  }
}

interface Props {
  results: SimResults
}

const props = defineProps<Props>()

// Filter out units that didn't run any missions (only show units with aircraft utilization)
const activeUnits = computed(() => {
  if (!props.results?.utilization) return {}

  const filtered: Record<string, any> = {}
  const threshold = 0.001 // 0.1% threshold to filter out negligible utilization

  for (const [unit, util] of Object.entries(props.results.utilization)) {
    // Only include units that used aircraft (indicating they ran missions)
    // Units with only duty assignments (crew utilization without aircraft) are excluded
    if (util.aircraft > threshold) {
      filtered[unit] = util
    }
  }
  return filtered
})

function formatPercent(value: number): string {
  return (value * 100).toFixed(0) + '%'
}

function getResourceTooltip(unit: string, resourceType: 'pilot' | 'so' | 'intel' | 'aircraft'): string {
  const breakdown = getResourceBreakdown(unit, resourceType)
  if (!breakdown) return ''

  if (resourceType === 'aircraft') {
    const stats = breakdown as { total: number; used: number; utilizationPercent: number; efficiencyPercent: number; busyHours: number }
    return `Total: ${stats.total}\nUsed: ${stats.used} (${stats.utilizationPercent.toFixed(1)}% utilization)\nEfficiency: ${stats.efficiencyPercent.toFixed(1)}% (${stats.busyHours.toFixed(1)} busy hours)`
  } else {
    const stats = breakdown as { rawTotal: number; unavailable: number; unavailablePercent: number; busy: number; busyPercent: number; idle: number; idlePercent: number }
    const lines = [
      `Raw Headcount: ${stats.rawTotal}`,
      `  ├─ Busy: ${stats.busy} (${stats.busyPercent.toFixed(1)}%) - duties & flights`,
      `  ├─ Unavailable: ${stats.unavailable} (${stats.unavailablePercent.toFixed(1)}%) - leave, medical, training, etc.`,
      `  └─ Idle: ${stats.idle} (${stats.idlePercent.toFixed(1)}%)`
    ]
    return lines.join('\n')
  }
}

// Calculate if we have staffing data (availability factors present)
const hasStaffingData = computed(() => {
  const units = Object.values(activeUnits.value)
  if (units.length === 0) return false
  return units[0]?.availability_factors !== undefined
})

// Get resource breakdown from pre-calculated backend stats (no frontend calculations)
function getResourceBreakdown(unit: string, resourceType: 'pilot' | 'so' | 'intel' | 'aircraft') {
  if (!props.results?.utilization[unit]) return null

  const util = props.results.utilization[unit]

  if (resourceType === 'aircraft') {
    return util.aircraft_stats || null
  } else if (resourceType === 'pilot') {
    return util.pilot_stats || null
  } else if (resourceType === 'so') {
    return util.so_stats || null
  } else {
    return util.intel_stats || null
  }
}


</script>

<template>
  <div class="utilization-tab">
    <div>
      <!-- Explanation for effective numbers -->
      <div v-if="hasStaffingData" class="utilization-explanation">
        <p>
          <strong>Utilization</strong> shows the percentage of equipment/personnel that were used at least once.
          <strong>Efficiency</strong> shows what percentage of time the equipment/personnel were actually busy working.
        </p>
        <p class="availability-note">
          <strong>Note on Unavailable Personnel:</strong> The dashed-green "Unavailable" segment represents the
          long-term average
          reduction in available workforce due to leave, medical, training, and range commitments over the simulation
          period.
          The green "Used" segment includes all personnel who received work assignments, including those on ODO, SDO,
          SDNCO
          duties, and flight operations. This differs from the personnel timeline views above, which shows day-by-day
          unavailability
          including duty assignments as part of daily unavailable counts.
        </p>
      </div>

      <div v-for="(util, unit) in activeUnits" :key="unit" class="unit-utilization">
        <div class="unit-name">{{ unit }}</div>

        <!-- Effective Crew Calculation Display -->
        <div v-if="util.availability_factors" class="crew-calculation-info">
          <div class="crew-calc-row">
            <span class="crew-calc-label">Pilot:</span>
            <span class="crew-calc-value">
              {{ util.initial_crew?.pilot || 0 }} total × {{ (util.availability_factors.pilot * 100).toFixed(1) }}%
              availability = <strong>{{ util.effective_crew?.pilot || 0 }} effective</strong>
            </span>
          </div>
          <div class="crew-calc-row">
            <span class="crew-calc-label">SO:</span>
            <span class="crew-calc-value">
              {{ util.initial_crew?.so || 0 }} total × {{ (util.availability_factors.so * 100).toFixed(1) }}%
              availability = <strong>{{ util.effective_crew?.so || 0 }} effective</strong>
            </span>
          </div>
          <div class="crew-calc-row">
            <span class="crew-calc-label">Intel:</span>
            <span class="crew-calc-value">
              {{ util.initial_crew?.intel || 0 }} total × {{ (util.availability_factors.intel * 100).toFixed(1) }}%
              availability = <strong>{{ util.effective_crew?.intel || 0 }} effective</strong>
            </span>
          </div>
        </div>

        <div class="util-rows">
          <div class="util-row">
            <span class="util-label">Aircraft</span>
            <div class="util-bar-container" :title="getResourceTooltip(unit, 'aircraft')">
              <div class="util-bar util-bar-busy" :style="{ width: formatPercent(util.aircraft) }">
                <span class="segment-label" v-if="util.aircraft > 0.08">
                  {{ Math.round((results.initial_resources?.aircraftByUnit[unit] || 0) * util.aircraft) }}
                </span>
              </div>
              <div v-if="(1 - util.aircraft) > 0" class="util-bar util-bar-idle"
                :style="{ width: formatPercent(1 - util.aircraft) }">
                <span class="segment-label" v-if="(1 - util.aircraft) > 0.08">
                  {{ Math.round((results.initial_resources?.aircraftByUnit[unit] || 0) * (1 - util.aircraft)) }}
                </span>
              </div>
            </div>
            <span class="util-value">{{ formatPercent(util.aircraft) }}</span>
          </div>
          <div class="util-row util-row-secondary">
            <span class="util-label util-label-secondary">Efficiency</span>
            <div class="util-bar-container">
              <div class="util-bar util-bar-efficiency"
                :style="{ width: formatPercent(util.aircraft_efficiency || 0) }">
              </div>
            </div>
            <span class="util-value util-value-secondary">{{ formatPercent(util.aircraft_efficiency || 0) }}</span>
          </div>
          <div class="util-row">
            <span class="util-label">Pilot</span>
            <div class="util-bar-container" :title="getResourceTooltip(unit, 'pilot')">
              <div class="util-bar util-bar-busy" :style="{ width: (util.pilot_stats.busyPercent) + '%' }">
                <span class="segment-label" v-if="util.pilot_stats.busyPercent > 8">
                  {{ util.pilot_stats.busy }}
                </span>
              </div>
              <div v-if="util.pilot_stats.unavailablePercent > 0" class="util-bar util-bar-unavailable"
                :style="{ width: (util.pilot_stats.unavailablePercent) + '%' }">
                <span class="segment-label" v-if="util.pilot_stats.unavailablePercent > 8">
                  {{ util.pilot_stats.unavailable }}
                </span>
              </div>
              <div v-if="util.pilot_stats.idlePercent > 0" class="util-bar util-bar-idle"
                :style="{ width: (util.pilot_stats.idlePercent) + '%' }">
                <span class="segment-label" v-if="util.pilot_stats.idlePercent > 8">
                  {{ util.pilot_stats.idle }}
                </span>
              </div>
            </div>
            <span class="util-value">{{ formatPercent(util.pilot_stats.trueForceUtilization) }}</span>
          </div>
          <div class="util-row">
            <span class="util-label">SO</span>
            <div class="util-bar-container" :title="getResourceTooltip(unit, 'so')">
              <div class="util-bar util-bar-busy" :style="{ width: (util.so_stats.busyPercent) + '%' }">
                <span class="segment-label" v-if="util.so_stats.busyPercent > 8">
                  {{ util.so_stats.busy }}
                </span>
              </div>
              <div v-if="util.so_stats.unavailablePercent > 0" class="util-bar util-bar-unavailable"
                :style="{ width: (util.so_stats.unavailablePercent) + '%' }">
                <span class="segment-label" v-if="util.so_stats.unavailablePercent > 8">
                  {{ util.so_stats.unavailable }}
                </span>
              </div>
              <div v-if="util.so_stats.idlePercent > 0" class="util-bar util-bar-idle"
                :style="{ width: (util.so_stats.idlePercent) + '%' }">
                <span class="segment-label" v-if="util.so_stats.idlePercent > 8">
                  {{ util.so_stats.idle }}
                </span>
              </div>
            </div>
            <span class="util-value">{{ formatPercent(util.so_stats.trueForceUtilization) }}</span>
          </div>
          <div class="util-row">
            <span class="util-label">Intel</span>
            <div class="util-bar-container" :title="getResourceTooltip(unit, 'intel')">
              <div class="util-bar util-bar-busy" :style="{ width: (util.intel_stats.busyPercent) + '%' }">
                <span class="segment-label" v-if="util.intel_stats.busyPercent > 8">
                  {{ util.intel_stats.busy }}
                </span>
              </div>
              <div v-if="util.intel_stats.unavailablePercent > 0" class="util-bar util-bar-unavailable"
                :style="{ width: (util.intel_stats.unavailablePercent) + '%' }">
                <span class="segment-label" v-if="util.intel_stats.unavailablePercent > 8">
                  {{ util.intel_stats.unavailable }}
                </span>
              </div>
              <div v-if="util.intel_stats.idlePercent > 0" class="util-bar util-bar-idle"
                :style="{ width: (util.intel_stats.idlePercent) + '%' }">
                <span class="segment-label" v-if="util.intel_stats.idlePercent > 8">
                  {{ util.intel_stats.idle }}
                </span>
              </div>
            </div>
            <span class="util-value">{{ formatPercent(util.intel_stats.trueForceUtilization) }}</span>
          </div>
        </div>
      </div>

      <!-- Legend for bar segments -->
      <div class="utilization-legend">
        <div class="legend-item">
          <div class="legend-color legend-busy"></div>
          <span>Used (includes duties & flights)</span>
        </div>
        <div class="legend-item">
          <div class="legend-color legend-efficiency"></div>
          <span>Efficiency (% of time busy)</span>
        </div>
        <div class="legend-item">
          <div class="legend-color legend-unavailable"></div>
          <span>Unavailable (leave, medical, training avg)</span>
        </div>
        <div class="legend-item">
          <div class="legend-color legend-idle"></div>
          <span>Idle</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.utilization-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.utilization-legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--text-muted-color);
}

.legend-color {
  width: 20px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

.legend-busy {
  background: linear-gradient(to right, #4ade80, #22c55e);
}

.legend-efficiency {
  background: linear-gradient(to right, #60a5fa, #3b82f6);
}

.legend-idle {
  background: linear-gradient(to right, #ef4444, #dc2626);
}

.legend-unavailable {
  background: repeating-linear-gradient(45deg,
      #86efac,
      #86efac 4px,
      #4ade80 4px,
      #4ade80 8px);
}

.utilization-explanation {
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 16px;
}

.utilization-explanation p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--text-muted-color);
}

.utilization-explanation .availability-note {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(59, 130, 246, 0.2);
  font-size: 0.8rem;
}

.utilization-explanation strong {
  color: var(--text-color);
  font-weight: 600;
}

.unit-utilization {
  margin-bottom: 16px;
}

.unit-utilization:last-child {
  margin-bottom: 0;
}

.unit-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-color);
  margin-bottom: 8px;
}

.crew-calculation-info {
  background: rgba(34, 197, 94, 0.05);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 4px;
  padding: 8px 12px;
  margin-bottom: 12px;
}

.crew-calc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  margin-bottom: 4px;
  color: var(--text-muted-color);
}

.crew-calc-row:last-child {
  margin-bottom: 0;
}

.crew-calc-label {
  font-weight: 600;
  color: var(--text-color);
  min-width: 50px;
}

.crew-calc-value {
  flex: 1;
}

.crew-calc-value strong {
  color: #16a34a;
  font-weight: 700;
}

.util-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.util-row {
  display: grid;
  grid-template-columns: 80px 1fr 50px;
  gap: 8px;
  align-items: center;
}

.util-row-secondary {
  margin-top: -2px;
  opacity: 0.85;
}

.util-label {
  font-size: 0.8rem;
  color: var(--text-muted-color);
}

.util-label-secondary {
  font-size: 0.75rem;
  padding-left: 12px;
  font-style: italic;
}

.util-value-secondary {
  font-size: 0.75rem;
  opacity: 0.9;
}

.util-bar-container {
  height: 16px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 3px;
  overflow: hidden;
}

.util-bar {
  height: 100%;
  float: left;
  transition: width 0.3s ease;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.segment-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  position: absolute;
  white-space: nowrap;
  z-index: 1;
  user-select: none;
  pointer-events: none;
}

.util-bar-busy {
  background: linear-gradient(to right, #4ade80, #22c55e);
}

.util-bar-efficiency {
  background: linear-gradient(to right, #60a5fa, #3b82f6);
}

.util-bar-idle {
  background: linear-gradient(to right, #ef4444, #dc2626);
}

.util-bar-unavailable {
  background: repeating-linear-gradient(45deg,
      #86efac,
      #86efac 4px,
      #4ade80 4px,
      #4ade80 8px);
}

.util-value {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-color);
  text-align: right;
}

.availability-info {
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 4px;
  padding: 8px 12px;
  margin-bottom: 8px;
}

.availability-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  margin-bottom: 4px;
}

.availability-row:last-child {
  margin-bottom: 0;
}

.info-label {
  color: var(--text-muted-color);
  font-weight: 500;
}

.info-value {
  color: var(--accent-blue);
  font-weight: 700;
}

.info-detail {
  color: var(--text-muted-color);
  font-size: 0.75rem;
  font-style: italic;
}

.calc-link {
  background: none;
  border: none;
  color: var(--accent-blue);
  text-decoration: underline;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0;
  margin-left: 8px;
  transition: color 0.2s ease;
}

.calc-link:hover {
  color: #2563eb;
}

.calc-breakdown {
  margin-top: 8px;
  padding: 10px;
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 4px;
  font-size: 0.8rem;
}

.calc-title {
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 8px;
  font-size: 0.85rem;
}

.calc-step {
  margin-bottom: 6px;
  padding-left: 8px;
  line-height: 1.5;
}

.calc-step:last-child {
  margin-bottom: 0;
}

.calc-note {
  margin-top: 4px;
  padding-left: 16px;
  color: var(--text-muted-color);
  font-size: 0.75rem;
  font-style: italic;
}
</style>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import embed from 'vega-embed'

interface AggregatedStatistics {
  mean: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  p95: number
  p99: number
  min: number
  max: number
  stddev: number
}

interface PercentileTimeline {
  timeline: any[]
  rawTimeline: any[]
  availabilityTimeline: any | null
  missionsCompleted: number
  stddev: number
}

interface MonteCarloResults {
  iterations: number
  horizon_hours: number
  missions: Record<string, AggregatedStatistics>
  rejections: Record<string, AggregatedStatistics>
  utilization: Record<string, Record<string, AggregatedStatistics>>
  by_type?: Record<string, Record<string, AggregatedStatistics>>
  percentile_timelines?: Record<string, PercentileTimeline>
  initial_resources?: {
    units: string[]
    aircraftByUnit: Record<string, number>
    staffingByUnit: Record<string, { pilot: number; so: number; intel: number }>
    payloadByUnit: Record<string, Record<string, number>>
    overrides_applied: boolean
  }
  unitSplit?: { vmu1: number; vmu3: number }
  personnel_availability?: {
    '7318'?: { daily_crew_rest_hours?: number }
    '7314'?: { daily_crew_rest_hours?: number }
    '0231'?: { daily_crew_rest_hours?: number }
  }
  iterations_data?: Array<{ missions?: { completed?: number } }> // Individual iteration results
}

interface Props {
  results: MonteCarloResults | null
}

const props = defineProps<Props>()

// Chart refs
const histogramRef = ref<HTMLElement | null>(null)
const boxPlotRef = ref<HTMLElement | null>(null)
const convergenceRef = ref<HTMLElement | null>(null)
const cdfRef = ref<HTMLElement | null>(null)

// Extract raw values from iterations data
const completedMissionsValues = computed(() => {
  if (!props.results?.iterations_data) return []
  return props.results.iterations_data
    .map(iter => iter.missions?.completed ?? 0)
    .filter(v => typeof v === 'number')
})

// Calculate convergence data (running mean)
const convergenceData = computed(() => {
  const values = completedMissionsValues.value
  if (values.length === 0) return []
  
  const targetMean = props.results?.missions?.completed?.mean ?? 0
  const data: Array<{ iteration: number; runningMean: number; targetMean: number }> = []
  let sum = 0
  
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (value === undefined) continue
    sum += value
    const runningMean = sum / (i + 1)
    data.push({
      iteration: i + 1,
      runningMean,
      targetMean
    })
  }
  
  return data
})

// Calculate CDF data
const cdfData = computed(() => {
  const values = [...completedMissionsValues.value].sort((a, b) => a - b)
  if (values.length === 0) return []
  
  const data: Array<{ value: number; cumulative: number }> = []
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (value === undefined) continue
    data.push({
      value,
      cumulative: (i + 1) / values.length
    })
  }
  
  return data
})

// Render charts when data changes
watch(() => props.results, async () => {
  await nextTick()
  await renderCharts()
}, { deep: true })

onMounted(async () => {
  await nextTick()
  await renderCharts()
})

async function renderCharts() {
  if (!props.results) return
  
  // Clear previous charts
  const clearChart = (ref: HTMLElement | null) => {
    if (ref) {
      ref.innerHTML = ''
    }
  }
  
  clearChart(histogramRef.value)
  clearChart(boxPlotRef.value)
  clearChart(convergenceRef.value)
  clearChart(cdfRef.value)
  
  // Render Histogram
  if (histogramRef.value && completedMissionsValues.value.length > 0) {
    const histogramSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: { values: completedMissionsValues.value.map(v => ({ missions: v })) },
      mark: 'bar' as const,
      encoding: {
        x: {
          bin: { maxbins: 30 },
          field: 'missions',
          title: 'Missions Completed'
        },
        y: {
          aggregate: 'count',
          title: 'Frequency'
        },
        color: { value: '#3b82f6' }
      },
      width: 'container' as const,
      height: 250
    }
    await embed(histogramRef.value, histogramSpec, { actions: false })
  }
  
  // Render Box Plot (using custom layers since Vega-Lite doesn't have native boxplot)
  if (boxPlotRef.value && props.results.missions?.completed) {
    const stat = props.results.missions.completed
    
    const boxPlotSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: {
        values: [{
          category: 'Missions Completed',
          min: stat.min,
          q1: stat.p25,
          median: stat.p50,
          q3: stat.p75,
          max: stat.max,
          mean: stat.mean
        }]
      },
      layer: [
        // Lower whisker line (min to q1)
        {
          mark: { type: 'rule' as const, stroke: '#3b82f6', strokeWidth: 2 },
          encoding: {
            x: { field: 'category', type: 'ordinal' as const, title: null },
            y: { field: 'min', type: 'quantitative' as const, title: 'Missions Completed', scale: { zero: false } },
            y2: { field: 'q1', type: 'quantitative' as const }
          }
        },
        // Upper whisker line (q3 to max)
        {
          mark: { type: 'rule' as const, stroke: '#3b82f6', strokeWidth: 2 },
          encoding: {
            x: { field: 'category', type: 'ordinal' as const },
            y: { field: 'q3', type: 'quantitative' as const },
            y2: { field: 'max', type: 'quantitative' as const }
          }
        },
        // Horizontal line at min (using transform to create endpoints)
        {
          mark: { type: 'rule' as const, stroke: '#3b82f6', strokeWidth: 2 },
          transform: [
            { calculate: 'datum.category', as: 'x' },
            { calculate: 'datum.min', as: 'y' }
          ],
          encoding: {
            x: { field: 'category', type: 'ordinal' as const },
            x2: { field: 'category', type: 'ordinal' as const },
            y: { field: 'min', type: 'quantitative' as const }
          }
        },
        // Horizontal line at max
        {
          mark: { type: 'rule' as const, stroke: '#3b82f6', strokeWidth: 2 },
          encoding: {
            x: { field: 'category', type: 'ordinal' as const },
            x2: { field: 'category', type: 'ordinal' as const },
            y: { field: 'max', type: 'quantitative' as const }
          }
        },
        // Box (q1 to q3)
        {
          mark: { type: 'rect' as const, fill: '#3b82f6', opacity: 0.3 },
          encoding: {
            x: { field: 'category', type: 'ordinal' as const },
            y: { field: 'q1', type: 'quantitative' as const },
            y2: { field: 'q3', type: 'quantitative' as const }
          }
        },
        // Median line
        {
          mark: { type: 'rule' as const, stroke: '#1e40af', strokeWidth: 3 },
          encoding: {
            x: { field: 'category', type: 'ordinal' as const },
            x2: { field: 'category', type: 'ordinal' as const },
            y: { field: 'median', type: 'quantitative' as const }
          }
        },
        // Mean point
        {
          mark: { type: 'point' as const, color: '#ef4444', size: 120, shape: 'diamond' as const, filled: true },
          encoding: {
            x: { field: 'category', type: 'ordinal' as const },
            y: { field: 'mean', type: 'quantitative' as const }
          }
        }
      ],
      width: 'container' as const,
      height: 250
    }
    await embed(boxPlotRef.value, boxPlotSpec, { actions: false })
  }
  
  // Render Convergence Chart
  if (convergenceRef.value && convergenceData.value.length > 0) {
    const convergenceSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: { values: convergenceData.value },
      layer: [
        {
          mark: { type: 'line' as const, stroke: '#3b82f6', strokeWidth: 2 },
          encoding: {
            x: { field: 'iteration', type: 'quantitative' as const, title: 'Iteration' },
            y: { field: 'runningMean', type: 'quantitative' as const, title: 'Running Mean' }
          }
        },
        {
          mark: { type: 'line' as const, stroke: '#ef4444', strokeDash: [5, 5], strokeWidth: 2 },
          encoding: {
            x: { field: 'iteration', type: 'quantitative' as const },
            y: { field: 'targetMean', type: 'quantitative' as const }
          }
        }
      ],
      width: 'container' as const,
      height: 250
    }
    await embed(convergenceRef.value, convergenceSpec, { actions: false })
  }
  
  // Render CDF
  if (cdfRef.value && cdfData.value.length > 0) {
    const cdfSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: { values: cdfData.value },
      mark: { type: 'line' as const, stroke: '#3b82f6', strokeWidth: 2, interpolate: 'step-after' as const },
      encoding: {
        x: { field: 'value', type: 'quantitative' as const, title: 'Missions Completed' },
        y: { field: 'cumulative', type: 'quantitative' as const, title: 'Cumulative Probability', scale: { domain: [0, 1] } }
      },
      width: 'container' as const,
      height: 250
    }
    await embed(cdfRef.value, cdfSpec, { actions: false })
  }
}

function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + '%'
}

function formatNumber(value: number): string {
  return value.toFixed(1)
}

function formatStat(stat: AggregatedStatistics | null | undefined): string {
  if (!stat) return '—'
  const stddev = stat.stddev > 0 ? ` ±${formatNumber(stat.stddev)}` : ''
  return `${formatNumber(stat.mean)} (${formatNumber(stat.p50)})${stddev}`
}

function formatStatWithRange(stat: AggregatedStatistics | null | undefined): string {
  if (!stat) return '—'
  const stddev = stat.stddev > 0 ? ` ±${formatNumber(stat.stddev)}` : ''
  return `${formatNumber(stat.mean)} [${formatNumber(stat.p10)}-${formatNumber(stat.p90)}]${stddev}`
}
</script>

<template>
  <div class="results">
    <div v-if="!results" class="no-results">
      <p>Run a Monte Carlo simulation to see results</p>
    </div>

    <div v-else class="results-content">
      <!-- Info Section -->
      <div class="info-section">
        <div class="info-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span class="info-title">Understanding Your Results</span>
        </div>
        <div class="info-content">
          <p class="info-text">
            <strong>Mean:</strong> The average outcome across all {{ results.iterations.toLocaleString() }} simulation
            runs.
          </p>
          <p class="info-text">
            <strong>Median (P50):</strong> The middle value - half of all runs had better results, half had worse. This
            is often more representative than the mean.
          </p>
          <p class="info-text">
            <strong>Range [P10-P90]:</strong> Shows the spread of results. P10 is the optimistic scenario (10% of runs
            did better), P90 is the pessimistic scenario (90% of runs did better). Most outcomes fall within this range.
          </p>
          <p class="info-text">
            <strong>Standard Deviation (±):</strong> Measures how much results vary. A smaller number means more
            consistent outcomes.
          </p>
        </div>
      </div>

      <!-- Summary Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">
            Requested
            <span class="stat-help"
              :title="'Total number of missions that were requested during the simulation period'">ⓘ</span>
          </div>
          <div class="stat-value">{{ formatStat(results.missions?.requested) }}</div>
          <div class="stat-subtitle">Average (Typical)</div>
          <div class="stat-explanation">Average across all runs, with typical outcome in parentheses and standard
            deviation</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Started
            <span class="stat-help"
              :title="'Number of missions that successfully began (had required resources available)'">ⓘ</span>
          </div>
          <div class="stat-value">{{ formatStat(results.missions?.started) }}</div>
          <div class="stat-subtitle">Average (Typical)</div>
          <div class="stat-explanation">Average across all runs, with typical outcome in parentheses and standard
            deviation</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Completed
            <span class="stat-help" :title="'Number of missions that finished successfully'">ⓘ</span>
          </div>
          <div class="stat-value">{{ formatStat(results.missions?.completed) }}</div>
          <div class="stat-subtitle">Average (Typical)</div>
          <div class="stat-explanation">Average across all runs, with typical outcome in parentheses and standard
            deviation</div>
        </div>
        <div class="stat-card rejected">
          <div class="stat-label">
            Rejected
            <span class="stat-help"
              :title="'Number of missions that could not be started due to missing resources (aircraft, crew, or payload)'">ⓘ</span>
          </div>
          <div class="stat-value">{{ formatStat(results.missions?.rejected) }}</div>
          <div class="stat-subtitle">Average (Typical)</div>
          <div class="stat-explanation">Average across all runs, with typical outcome in parentheses and standard
            deviation</div>
        </div>
      </div>

      <!-- Iterations Info -->
      <div class="iterations-info">
        <span class="iterations-label">Iterations:</span>
        <span class="iterations-value">{{ results.iterations }}</span>
        <span class="horizon-label">Horizon:</span>
        <span class="horizon-value">{{ results.horizon_hours }}h</span>
      </div>

      <!-- Rejections Breakdown -->
      <div class="rejections-section">
        <div class="section-title">
          Rejections by Resource Type
          <span class="section-help"
            :title="'Shows why missions were rejected. Format: Average [Optimistic-Pessimistic range]'">ⓘ</span>
        </div>
        <div class="section-description">
          Average number of rejections, with range showing optimistic (P10) to pessimistic (P90) scenarios. Standard
          deviation (±) shows variation across all runs.
        </div>
        <div class="rejections-grid">
          <div class="rejection-item">
            <span class="rejection-label">Aircraft</span>
            <span class="rejection-value">{{ formatStatWithRange(results.rejections?.aircraft) }}</span>
          </div>
          <div class="rejection-item">
            <span class="rejection-label">Payload</span>
            <span class="rejection-value">{{ formatStatWithRange(results.rejections?.payload) }}</span>
          </div>
          <div class="rejection-item">
            <span class="rejection-label">Sensor Operator</span>
            <span class="rejection-value">{{ formatStatWithRange(results.rejections?.so) }}</span>
          </div>
          <div class="rejection-item">
            <span class="rejection-label">Pilot</span>
            <span class="rejection-value">{{ formatStatWithRange(results.rejections?.pilot) }}</span>
          </div>
        </div>
      </div>

      <!-- Utilization -->
      <div class="utilization-section">
        <div class="section-title">
          Resource Utilization
          <span class="section-help"
            :title="'Percentage of time resources are actively in use. Format: Average [Optimistic-Pessimistic range]'">ⓘ</span>
        </div>
        <div class="section-description">
          Average utilization percentage, with range showing optimistic (P10) to pessimistic (P90) scenarios. Standard
          deviation (±) shows variation across all runs.
        </div>
        <div v-for="(util, unit) in results.utilization" :key="unit" class="unit-utilization">
          <div class="unit-name">{{ unit }}</div>
          <div class="util-rows">
            <div class="util-row">
              <span class="util-label">Aircraft</span>
              <div class="util-bar-container">
                <div class="util-bar" :style="{ width: formatPercent(util.aircraft?.mean || 0) }"></div>
              </div>
              <span class="util-value">{{ formatStatWithRange(util.aircraft) }}</span>
            </div>
            <div class="util-row">
              <span class="util-label">Pilot</span>
              <div class="util-bar-container">
                <div class="util-bar" :style="{ width: formatPercent(util.pilot?.mean || 0) }"></div>
              </div>
              <span class="util-value">{{ formatStatWithRange(util.pilot) }}</span>
            </div>
            <div class="util-row">
              <span class="util-label">SO</span>
              <div class="util-bar-container">
                <div class="util-bar" :style="{ width: formatPercent(util.so?.mean || 0) }"></div>
              </div>
              <span class="util-value">{{ formatStatWithRange(util.so) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- By Mission Type -->
      <div v-if="results.by_type && Object.keys(results.by_type).length > 0" class="by-type-section">
        <div class="section-title">
          Results by Mission Type
          <span class="section-help"
            :title="'Breakdown of mission statistics for each mission type. Format: Average [Optimistic-Pessimistic range]'">ⓘ</span>
        </div>
        <div class="section-description">
          Average outcomes per mission type, with range showing optimistic (P10) to pessimistic (P90) scenarios.
          Standard deviation (±) shows variation across all runs.
        </div>
        <div v-for="(stats, missionType) in results.by_type" :key="missionType" class="mission-type-stats">
          <div class="mission-type-name">{{ missionType }}</div>
          <div class="mission-stats-grid">
            <div class="mission-stat-item">
              <span class="mission-stat-label">Requested</span>
              <span class="mission-stat-value">{{ formatStatWithRange(stats.requested) }}</span>
            </div>
            <div class="mission-stat-item">
              <span class="mission-stat-label">Started</span>
              <span class="mission-stat-value">{{ formatStatWithRange(stats.started) }}</span>
            </div>
            <div class="mission-stat-item">
              <span class="mission-stat-label">Completed</span>
              <span class="mission-stat-value">{{ formatStatWithRange(stats.completed) }}</span>
            </div>
            <div class="mission-stat-item">
              <span class="mission-stat-label">Rejected</span>
              <span class="mission-stat-value">{{ formatStatWithRange(stats.rejected) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Statistical Charts -->
      <div v-if="results.iterations_data && results.iterations_data.length > 0" class="charts-section">
        <div class="section-title">
          Statistical Analysis Charts
          <span class="section-help"
            :title="'Visual analysis of Monte Carlo simulation results showing distribution, convergence, and cumulative probabilities'">ⓘ</span>
        </div>
        <div class="section-description">
          Visual representations of the simulation results to better understand the distribution and convergence of outcomes.
        </div>
        
        <div class="charts-grid">
          <!-- Histogram -->
          <div class="chart-container">
            <div class="chart-title">Histogram: Missions Completed Distribution</div>
            <div class="chart-description">Frequency distribution of missions completed across all iterations</div>
            <div ref="histogramRef" class="chart-wrapper"></div>
          </div>

          <!-- Box Plot -->
          <div class="chart-container">
            <div class="chart-title">Box Plot: Missions Completed Statistics</div>
            <div class="chart-description">Shows min, Q1, median, Q3, max, and mean (red diamond)</div>
            <div ref="boxPlotRef" class="chart-wrapper"></div>
          </div>

          <!-- Convergence Chart -->
          <div class="chart-container">
            <div class="chart-title">Convergence of Mean</div>
            <div class="chart-description">Running mean converging to target mean (red dashed line)</div>
            <div ref="convergenceRef" class="chart-wrapper"></div>
          </div>

          <!-- CDF -->
          <div class="chart-container">
            <div class="chart-title">Cumulative Distribution Function (CDF)</div>
            <div class="chart-description">Probability that missions completed is less than or equal to a given value</div>
            <div ref="cdfRef" class="chart-wrapper"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.results {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.no-results {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted-color);
  font-style: italic;
}

.results-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card {
  padding: 12px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  text-align: center;
}

.stat-card.rejected {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  margin-bottom: 4px;
  font-weight: 500;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: 4px;
}

.stat-subtitle {
  font-size: 0.7rem;
  color: var(--text-muted-color);
  font-style: italic;
  margin-bottom: 2px;
}

.stat-explanation {
  font-size: 0.65rem;
  color: var(--text-muted-color);
  margin-top: 4px;
  line-height: 1.2;
}

.stat-help {
  display: inline-block;
  margin-left: 4px;
  cursor: help;
  color: var(--accent-blue);
  font-size: 0.85rem;
  font-weight: normal;
  vertical-align: middle;
}

.stat-label {
  display: flex;
  align-items: center;
  justify-content: center;
}

.info-section {
  padding: 12px 16px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 6px;
  margin-bottom: 16px;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.info-header svg {
  color: var(--accent-blue);
  flex-shrink: 0;
}

.info-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-color);
}

.info-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-color);
  line-height: 1.5;
}

.info-text strong {
  color: var(--accent-blue);
  font-weight: 600;
}

.section-description {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  margin-bottom: 12px;
  font-style: italic;
  line-height: 1.4;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-help {
  display: inline-block;
  cursor: help;
  color: var(--accent-blue);
  font-size: 0.85rem;
  font-weight: normal;
}

.iterations-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.85rem;
}

.iterations-label,
.horizon-label {
  color: var(--text-muted-color);
  font-weight: 500;
}

.iterations-value,
.horizon-value {
  color: var(--text-color);
  font-weight: 600;
  font-family: monospace;
}

.rejections-section,
.utilization-section,
.by-type-section {
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.section-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 12px;
  color: var(--text-color);
}

.rejections-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.rejection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.rejection-label {
  font-size: 0.85rem;
  color: var(--text-muted-color);
}

.rejection-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-color);
  font-family: monospace;
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

.util-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.util-row {
  display: grid;
  grid-template-columns: 80px 1fr 180px;
  gap: 8px;
  align-items: center;
}

.util-label {
  font-size: 0.8rem;
  color: var(--text-muted-color);
}

.util-bar-container {
  height: 16px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 3px;
  overflow: hidden;
}

.util-bar {
  height: 100%;
  background: linear-gradient(to right, #4ade80, #22c55e);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.util-value {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-color);
  text-align: right;
  font-family: monospace;
}

.mission-type-stats {
  margin-bottom: 12px;
  padding: 8px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.mission-type-stats:last-child {
  margin-bottom: 0;
}

.mission-type-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-color);
  margin-bottom: 8px;
}

.mission-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.mission-stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mission-stat-label {
  font-size: 0.75rem;
  color: var(--text-muted-color);
}

.mission-stat-value {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
  font-family: monospace;
}

.charts-section {
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-top: 16px;
}

.chart-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chart-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-color);
}

.chart-description {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-style: italic;
  margin-bottom: 4px;
}

.chart-wrapper {
  width: 100%;
  min-height: 250px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .rejections-grid {
    grid-template-columns: 1fr;
  }

  .mission-stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .util-row {
    grid-template-columns: 80px 1fr;
  }

  .util-value {
    grid-column: 1 / -1;
    text-align: left;
    margin-top: 4px;
  }

  .charts-grid {
    grid-template-columns: 1fr;
  }
}
</style>

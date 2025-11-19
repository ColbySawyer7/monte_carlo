<script setup lang="ts">
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

interface MonteCarloResults {
  iterations: number
  horizon_hours: number
  missions: Record<string, AggregatedStatistics>
  rejections: Record<string, AggregatedStatistics>
  utilization: Record<string, Record<string, AggregatedStatistics>>
  by_type?: Record<string, Record<string, AggregatedStatistics>>
  // TODO: Add percentile_timelines?: { p10?: any[], p50?: any[], p90?: any[] }
  // Each timeline matches DES timeline format (array of mission/rejection events)
}

interface Props {
  results: MonteCarloResults | null
}

defineProps<Props>()

function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + '%'
}

function formatNumber(value: number): string {
  return value.toFixed(1)
}

function formatStat(stat: AggregatedStatistics | null | undefined): string {
  if (!stat) return '—'
  return `${formatNumber(stat.mean)} (${formatNumber(stat.p50)})`
}

function formatStatWithRange(stat: AggregatedStatistics | null | undefined): string {
  if (!stat) return '—'
  return `${formatNumber(stat.mean)} [${formatNumber(stat.p10)}-${formatNumber(stat.p90)}]`
}
</script>

<template>
  <div class="results">
    <div v-if="!results" class="no-results">
      <p>Run a Monte Carlo simulation to see results</p>
    </div>

    <div v-else class="results-content">
      <!-- Summary Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Requested</div>
          <div class="stat-value">{{ formatStat(results.missions?.requested) }}</div>
          <div class="stat-subtitle">Mean (Median)</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Started</div>
          <div class="stat-value">{{ formatStat(results.missions?.started) }}</div>
          <div class="stat-subtitle">Mean (Median)</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Completed</div>
          <div class="stat-value">{{ formatStat(results.missions?.completed) }}</div>
          <div class="stat-subtitle">Mean (Median)</div>
        </div>
        <div class="stat-card rejected">
          <div class="stat-label">Rejected</div>
          <div class="stat-value">{{ formatStat(results.missions?.rejected) }}</div>
          <div class="stat-subtitle">Mean (Median)</div>
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
        <div class="section-title">Rejections (Mean [P10-P90])</div>
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
        <div class="section-title">Utilization (Mean [P10-P90])</div>
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
        <div class="section-title">By Mission Type (Mean [P10-P90])</div>
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

      <!-- TODO: Percentile Timelines Section -->
      <!-- Display 3 timelines side-by-side or stacked (P10, P50, P90) -->
      <!-- Reuse Timeline component from DES view, but adapt for multiple percentile timelines -->
      <!-- Add clear labels (P10, P50, P90) and possibly different visual styling to distinguish them -->
      <!-- Only show if results.percentile_timelines exists and has data -->
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
}
</style>


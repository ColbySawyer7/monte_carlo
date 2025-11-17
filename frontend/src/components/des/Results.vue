<script setup lang="ts">
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
    payload: number
  }
  utilization: Record<string, {
    aircraft: number
    pilot: number
    so: number
  }>
  by_type?: Record<string, {
    requested: number
    started: number
    completed: number
    rejected: number
  }>
}

interface Props {
  results: SimResults | null
}

defineProps<Props>()

function formatPercent(value: number): string {
  return (value * 100).toFixed(0) + '%'
}
</script>

<template>
  <div class="results">
    <div v-if="!results" class="no-results">
      <p>Run a scenario to see results</p>
    </div>

    <div v-else class="results-content">
      <!-- Summary Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Requested</div>
          <div class="stat-value">{{ results.missions.requested }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Started</div>
          <div class="stat-value">{{ results.missions.started }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Completed</div>
          <div class="stat-value">{{ results.missions.completed }}</div>
        </div>
        <div class="stat-card rejected">
          <div class="stat-label">Rejected</div>
          <div class="stat-value">{{ results.missions.rejected }}</div>
        </div>
      </div>

      <!-- Rejections Breakdown -->
      <div class="rejections-section">
        <div class="section-title">Rejections</div>
        <div class="rejections-grid">
          <div class="rejection-item">
            <span class="rejection-label">Aircraft</span>
            <span class="rejection-value">{{ results.rejections.aircraft }}</span>
          </div>
          <div class="rejection-item">
            <span class="rejection-label">Payload</span>
            <span class="rejection-value">{{ results.rejections.payload }}</span>
          </div>
          <div class="rejection-item">
            <span class="rejection-label">Sensor Operator</span>
            <span class="rejection-value">{{ results.rejections.so }}</span>
          </div>
          <div class="rejection-item">
            <span class="rejection-label">Pilot</span>
            <span class="rejection-value">{{ results.rejections.pilot }}</span>
          </div>
        </div>
      </div>

      <!-- Utilization -->
      <div class="utilization-section">
        <div class="section-title">Utilization</div>
        <div v-for="(util, unit) in results.utilization" :key="unit" class="unit-utilization">
          <div class="unit-name">{{ unit }}</div>
          <div class="util-rows">
            <div class="util-row">
              <span class="util-label">Aircraft</span>
              <div class="util-bar-container">
                <div class="util-bar" :style="{ width: formatPercent(util.aircraft) }"></div>
              </div>
              <span class="util-value">{{ formatPercent(util.aircraft) }}</span>
            </div>
            <div class="util-row">
              <span class="util-label">Pilot</span>
              <div class="util-bar-container">
                <div class="util-bar" :style="{ width: formatPercent(util.pilot) }"></div>
              </div>
              <span class="util-value">{{ formatPercent(util.pilot) }}</span>
            </div>
            <div class="util-row">
              <span class="util-label">SO</span>
              <div class="util-bar-container">
                <div class="util-bar" :style="{ width: formatPercent(util.so) }"></div>
              </div>
              <span class="util-value">{{ formatPercent(util.so) }}</span>
            </div>
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
}

.rejections-section,
.utilization-section {
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
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
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
  grid-template-columns: 80px 1fr 50px;
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
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .rejections-grid {
    grid-template-columns: 1fr;
  }
}
</style>

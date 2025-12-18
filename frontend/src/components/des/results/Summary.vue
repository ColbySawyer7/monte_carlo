<script setup lang="ts">
// TODO: review this file for cleanup and optimization
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
  duties?: {
    requested: number
    filled: number
    unfilled: number
  }
}

interface Props {
  results: SimResults
}

defineProps<Props>()
</script>

<template>
  <div class="summary-tab">

    <!-- Missions -->
    <div class="count-section">
      <div class="section-title">Missions</div>
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
    </div>

    <!-- Mission Rejections -->
    <div class="rejections-section">
      <div class="section-title">Mission Rejection Reasons</div>
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
          <span class="rejection-label">Pilot</span>
          <span class="rejection-value">{{ results.rejections.pilot }}</span>
        </div>
        <div class="rejection-item">
          <span class="rejection-label">Sensor Operator</span>
          <span class="rejection-value">{{ results.rejections.so }}</span>
        </div>
        <div class="rejection-item">
          <span class="rejection-label">Intel</span>
          <span class="rejection-value">{{ results.rejections.intel }}</span>
        </div>
      </div>
    </div>

    <!-- Duty Shifts -->
    <div v-if="results.duties" class="count-section">
      <div class="section-title">Duty Shifts</div>
      <div class="duties-grid">
        <div class="stat-card">
          <div class="stat-label">Requested</div>
          <div class="stat-value">{{ results.duties.requested }}</div>
        </div>
        <div class="stat-card success">
          <div class="stat-label">Filled</div>
          <div class="stat-value">{{ results.duties.filled }}</div>
        </div>
        <div class="stat-card rejected">
          <div class="stat-label">Unfilled</div>
          <div class="stat-value">{{ results.duties.unfilled }}</div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.summary-tab {
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

.count-section {
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.duties-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.rejections-section {
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

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .duties-grid {
    grid-template-columns: 1fr;
  }

  .rejections-grid {
    grid-template-columns: 1fr;
  }
}
</style>

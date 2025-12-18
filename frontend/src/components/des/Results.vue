<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { ref, computed } from 'vue'
import Summary from './results/Summary.vue'
import Utilization from './results/Utilization.vue'
import Analysis from './results/Analysis.vue'
import Comparison from './results/Comparison.vue'

const activeTab = ref<'summary' | 'utilization' | 'analysis' | 'comparison'>('summary')

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
  by_type?: Record<string, {
    requested: number
    started: number
    completed: number
    rejected: number
  }>
  availability_timeline?: {
    pilot: any
    so: any
  }
  initial_resources?: {
    units: string[]
    aircraftByUnit: Record<string, number>
    staffingByUnit: Record<string, { pilot: number; so: number; intel: number }>
    payloadByUnit: Record<string, Record<string, number>>
    overrides_applied: boolean
  }
}

interface Props {
  results: SimResults | null
  scenarioName?: string
  isRunning?: boolean
}

const props = defineProps<Props>()

// Calculate if we have analysis data (availability factors present)
const hasAnalysisData = computed(() => {
  if (!props.results?.utilization) return false
  const units = Object.values(props.results.utilization)
  if (units.length === 0) return false
  return units[0]?.availability_factors !== undefined
})
</script>

<template>
  <div class="results">
    <div class="results-header">
      <h3>Results</h3>
      <div v-if="results" class="results-meta">
        <span class="results-scenario-name">{{ scenarioName }}</span>
        <span class="results-timestamp">{{ new Date().toLocaleString() }}</span>
      </div>
    </div>
    <div v-if="isRunning" class="running-indicator">
      <div class="spinner"></div>
      <p>Running simulation...</p>
    </div>
    <div v-else-if="!results" class="no-results">
      <p>Run a simulation to see results</p>
    </div>

    <div v-else class="results-content">
      <!-- Tab Navigation -->
      <div class="tab-navigation">
        <button :class="['tab-btn', { active: activeTab === 'summary' }]" @click="activeTab = 'summary'">
          Summary
        </button>
        <button :class="['tab-btn', { active: activeTab === 'utilization' }]" @click="activeTab = 'utilization'">
          Utilization
        </button>
        <button v-if="hasAnalysisData" :class="['tab-btn', { active: activeTab === 'analysis' }]"
          @click="activeTab = 'analysis'">
          Analysis
        </button>
        <button :class="['tab-btn', { active: activeTab === 'comparison' }]" @click="activeTab = 'comparison'">
          Comparison
        </button>
      </div>

      <!-- Summary Tab -->
      <div v-show="activeTab === 'summary'" class="tab-panel">
        <Summary :results="results" />
      </div>

      <!-- Utilization Tab -->
      <div v-show="activeTab === 'utilization'" class="tab-panel">
        <Utilization :results="results" />
      </div>

      <!-- Analysis Tab -->
      <div v-if="hasAnalysisData" v-show="activeTab === 'analysis'" class="tab-panel">
        <Analysis :results="results" />
      </div>

      <!-- Comparison Tab -->
      <div v-show="activeTab === 'comparison'" class="tab-panel">
        <Comparison :current-results="results" :current-scenario-name="scenarioName || 'Unnamed Scenario'" />
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

/* Tab Navigation */
.tab-navigation {
  display: flex;
  gap: 4px;
  margin-top: 0px;
  margin-bottom: -16px;
  border-bottom: 2px solid var(--border-color);
  position: static !important;
  z-index: 0;
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-muted-color);
  transition: all 0.2s ease;
  position: relative;
}

.tab-btn:hover {
  color: var(--text-color);
  background: rgba(59, 130, 246, 0.05);
}

.tab-btn.active {
  color: var(--accent-blue);
  border-bottom-color: var(--accent-blue);
  background: rgba(59, 130, 246, 0.08);
}

.tab-panel {
  display: block;
}

.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.results-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
}

.results-meta {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.results-scenario-name {
  font-size: 0.9rem;
  color: var(--text-muted-color);
  font-style: italic;
  white-space: nowrap;
}

.results-timestamp {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-family: monospace;
  white-space: nowrap;
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
</style>

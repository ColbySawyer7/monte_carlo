<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import DESTimelines from '../des/Timelines.vue'

interface PercentileTimeline {
  timeline: any[]
  rawTimeline: any[]
  availabilityTimeline: any | null
  missionsCompleted: number
  stddev: number
}

interface Props {
  percentileTimelines?: Record<string, PercentileTimeline>
  horizonHours: number
  unitSplit?: { vmu1: number; vmu3: number }
  initialResources?: {
    units: string[]
    aircraftByUnit: Record<string, number>
    staffingByUnit: Record<string, { pilot: number; so: number; intel: number }>
    payloadByUnit: Record<string, Record<string, number>>
    overrides_applied: boolean
  }
  utilization?: Record<string, any>
  personnelAvailability?: {
    '7318'?: { daily_crew_rest_hours?: number }
    '7314'?: { daily_crew_rest_hours?: number }
    '0231'?: { daily_crew_rest_hours?: number }
  }
}

const props = defineProps<Props>()

// Percentile tab options with user-friendly descriptions
const percentileOptions = [
  { 
    key: 'mean', 
    label: 'Mean', 
    description: 'Average outcome across all runs',
    explanation: 'Shows the timeline from the simulation run that had the average number of completed missions'
  },
  { 
    key: 'p10', 
    label: 'P10', 
    description: 'Optimistic scenario (10% did better)',
    explanation: '10% of simulation runs had more completed missions. This represents a best-case scenario.'
  },
  { 
    key: 'p25', 
    label: 'P25', 
    description: '25% of runs did better',
    explanation: '25% of simulation runs had more completed missions. This is a relatively good outcome.'
  },
  { 
    key: 'p50', 
    label: 'P50 (Median)', 
    description: 'Typical outcome (50% did better)',
    explanation: 'Half of all simulation runs had more completed missions, half had fewer. This is the most representative outcome.'
  },
  { 
    key: 'p75', 
    label: 'P75', 
    description: '75% of runs did better',
    explanation: '75% of simulation runs had more completed missions. This represents a below-average outcome.'
  },
  { 
    key: 'p90', 
    label: 'P90', 
    description: 'Pessimistic scenario (90% did better)',
    explanation: '90% of simulation runs had more completed missions. This represents a worst-case scenario.'
  },
  { 
    key: 'p95', 
    label: 'P95', 
    description: '95% of runs did better',
    explanation: '95% of simulation runs had more completed missions. This is a very poor outcome.'
  },
  { 
    key: 'p99', 
    label: 'P99', 
    description: '99% of runs did better',
    explanation: '99% of simulation runs had more completed missions. This is an extremely poor outcome.'
  },
  { 
    key: 'min', 
    label: 'Min', 
    description: 'Best case outcome',
    explanation: 'The simulation run with the most completed missions - the absolute best possible outcome.'
  },
  { 
    key: 'max', 
    label: 'Max', 
    description: 'Worst case outcome',
    explanation: 'The simulation run with the fewest completed missions - the absolute worst possible outcome.'
  }
]

const activePercentile = ref<string>('p50')

// Load saved percentile from localStorage
onMounted(() => {
  const savedPercentile = localStorage.getItem('monteTimelineActivePercentile')
  if (savedPercentile && props.percentileTimelines?.[savedPercentile]) {
    activePercentile.value = savedPercentile
  }
})

// Save percentile to localStorage
watch(activePercentile, (newPercentile) => {
  localStorage.setItem('monteTimelineActivePercentile', newPercentile)
})

// Get current percentile timeline data
const currentTimeline = computed(() => {
  if (!props.percentileTimelines || !activePercentile.value) return null
  return props.percentileTimelines[activePercentile.value]
})

// Get current percentile info
const currentPercentileInfo = computed(() => {
  return percentileOptions.find(opt => opt.key === activePercentile.value)
})

// Format standard deviation display
function formatStdDev(stddev: number): string {
  if (stddev === 0) return ''
  return `±${stddev.toFixed(1)}`
}
</script>

<template>
  <div class="monte-timelines-container">
    <div v-if="!percentileTimelines || Object.keys(percentileTimelines).length === 0" class="no-timelines">
      <p>Timeline data not available. Run a simulation to see percentile timelines.</p>
    </div>

    <div v-else>
      <!-- Percentile Selector Tabs -->
      <div class="percentile-tabs">
        <button
          v-for="option in percentileOptions"
          :key="option.key"
          :class="['percentile-tab', { active: activePercentile === option.key }]"
          :disabled="!percentileTimelines?.[option.key]"
          @click="activePercentile = option.key"
          :title="option.description"
        >
          <span class="tab-label">{{ option.label }}</span>
          <span v-if="percentileTimelines?.[option.key]" class="tab-stats">
            {{ percentileTimelines[option.key].missionsCompleted }} missions
            <span v-if="percentileTimelines[option.key].stddev > 0" class="stddev">
              {{ formatStdDev(percentileTimelines[option.key].stddev) }}
            </span>
          </span>
        </button>
      </div>

      <!-- Current Percentile Info -->
      <div v-if="currentPercentileInfo && currentTimeline" class="percentile-info">
        <div class="info-content">
          <div class="info-main">
            <span class="info-label">{{ currentPercentileInfo.label }}:</span>
            <span class="info-description">{{ currentPercentileInfo.description }}</span>
          </div>
          <div class="info-stats">
            <span class="info-missions">{{ currentTimeline.missionsCompleted }} missions completed</span>
            <span v-if="currentTimeline.stddev > 0" class="info-stddev">
              Variation: {{ formatStdDev(currentTimeline.stddev) }}
            </span>
          </div>
          <div v-if="currentPercentileInfo.explanation" class="info-explanation">
            {{ currentPercentileInfo.explanation }}
          </div>
        </div>
      </div>

      <!-- DES Timeline Component (reused) -->
      <div v-if="currentTimeline" class="timeline-wrapper">
        <DESTimelines
          :timeline="currentTimeline.timeline"
          :raw-timeline="currentTimeline.rawTimeline"
          :availability-timeline="currentTimeline.availabilityTimeline"
          :horizon-hours="horizonHours"
          :unit-split="unitSplit || { vmu1: 0.5, vmu3: 0.5 }"
          :personnel-availability="personnelAvailability"
          :initial-resources="initialResources"
          :utilization="utilization"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.monte-timelines-container {
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 16px;
  overflow: hidden;
}

.no-timelines {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted-color);
  font-style: italic;
}

.percentile-tabs {
  display: flex;
  flex-wrap: wrap;
  border-bottom: 2px solid var(--border-color);
  background: rgba(0, 0, 0, 0.02);
  gap: 4px;
  padding: 4px;
}

.percentile-tab {
  flex: 1;
  min-width: 100px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted-color);
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.percentile-tab:hover:not(:disabled) {
  color: var(--text-color);
  background: rgba(59, 130, 246, 0.05);
}

.percentile-tab.active {
  color: var(--accent-blue);
  border-bottom-color: var(--accent-blue);
  background: rgba(59, 130, 246, 0.08);
}

.percentile-tab:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.tab-label {
  font-weight: 600;
}

.tab-stats {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--text-muted-color);
}

.tab-stats .stddev {
  color: var(--accent-blue);
  font-weight: 500;
}

.percentile-info {
  padding: 12px 16px;
  background: rgba(59, 130, 246, 0.05);
  border-bottom: 1px solid var(--border-color);
}

.info-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.85rem;
}

.info-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.info-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.info-label {
  font-weight: 600;
  color: var(--text-color);
}

.info-description {
  color: var(--text-muted-color);
  font-style: italic;
}

.info-missions {
  color: var(--text-color);
  font-weight: 500;
}

.info-stddev {
  color: var(--accent-blue);
  font-weight: 500;
  font-family: monospace;
}

.info-explanation {
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid var(--accent-blue);
  border-radius: 4px;
  color: var(--text-color);
  font-size: 0.8rem;
  line-height: 1.4;
  margin-top: 4px;
}

.timeline-wrapper {
  padding: 0;
}

@media (max-width: 768px) {
  .percentile-tabs {
    flex-direction: column;
  }

  .percentile-tab {
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
  }

  .info-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>


<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { computed } from 'vue'

interface LegendItem {
  color?: string
  gradient?: string
  pattern?: string
  line?: string
  label: string
  badge?: number | string
  badgeClass?: string
  colorStyle?: string
  text?: string
}

interface SelectorOption {
  value: string
  label: string
}

interface Props {
  unitName: string
  horizonHours: number
  timeMarkers: { value: number; label: string; id?: string }[]
  isExpanded?: boolean
  // Pagination props
  showPagination?: boolean
  currentPage?: number
  totalPages?: number
  currentStartHour?: number
  currentEndHour?: number
  pageWindowHours?: number
  windowOptions?: { label: string; hours: number }[]
  formatTimeLabel?: (hours: number) => string
  // Height selector props
  maxExpandedHeight?: number
  heightOptions?: { label: string; height: number }[]
  // Horizon marker props
  actualHorizonHours?: number
  // Legend props
  showLegend?: boolean
  legendItems?: LegendItem[]
  selectorLabel?: string
  selectorOptions?: SelectorOption[]
  selectorValue?: string
  showDivider?: boolean
  // Availability stats
  availabilityPercent?: number
  unavailabilityPercent?: number
  availableCount?: number
  unavailableCount?: number
}

interface Emits {
  (e: 'toggle'): void
  (e: 'prevPage'): void
  (e: 'nextPage'): void
  (e: 'updateWindowSize', hours: number): void
  (e: 'updateMaxHeight', height: number): void
  (e: 'updateSelector', value: string): void
}

const props = defineProps<Props>()

const emit = defineEmits<Emits>()

function handleToggle() {
  emit('toggle')
}

// Calculate if we should show the horizon marker
const showHorizonMarker = computed(() => {
  if (!props.actualHorizonHours || props.currentStartHour === undefined) return false
  // Show marker if the actual horizon falls within the current page window
  const pageStart = props.currentStartHour
  const pageEnd = pageStart + props.horizonHours
  return props.actualHorizonHours >= pageStart && props.actualHorizonHours <= pageEnd
})

const horizonMarkerPosition = computed(() => {
  if (!props.actualHorizonHours || props.currentStartHour === undefined) return 0
  const relativePosition = props.actualHorizonHours - props.currentStartHour
  return (relativePosition / props.horizonHours) * 100
})
</script>

<template>
  <div class="chart-row-wrapper">

    <!-- Pagination controls -->
    <div v-if="showPagination" class="pagination-controls">
      <button @click="emit('prevPage')" :disabled="currentPage === 0" class="page-btn">
        ← Previous
      </button>
      <div class="page-info">
        <span class="page-text">Page {{ (currentPage ?? 0) + 1 }} of {{ totalPages ?? 1 }}</span>
        <span v-if="formatTimeLabel" class="time-range">
          ({{ formatTimeLabel(currentStartHour ?? 0) }} - {{ formatTimeLabel(currentEndHour ?? 0) }})
        </span>
        <div v-if="windowOptions" class="window-selector">
          <label :for="`window-size-${unitName}`">Window:</label>
          <select :id="`window-size-${unitName}`" :value="pageWindowHours"
            @change="emit('updateWindowSize', Number(($event.target as HTMLSelectElement).value))"
            class="window-select">
            <option v-for="option in windowOptions" :key="option.hours" :value="option.hours">
              {{ option.label }}
            </option>
          </select>
        </div>
        <div v-if="heightOptions" class="height-selector">
          <label :for="`height-size-${unitName}`">Height:</label>
          <select :id="`height-size-${unitName}`" :value="maxExpandedHeight"
            @change="emit('updateMaxHeight', Number(($event.target as HTMLSelectElement).value))" class="height-select">
            <option v-for="option in heightOptions" :key="option.height" :value="option.height">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>
      <button @click="emit('nextPage')" :disabled="(currentPage ?? 0) >= (totalPages ?? 1) - 1" class="page-btn">
        Next →
      </button>
    </div>

    <div class="chart-row-layout">
      <!-- Left: Unit Label -->
      <div class="unit-label" @click="handleToggle" :class="{ 'clickable': true }">
        <div class="label-stack">
          <span class="expand-icon">{{ isExpanded ? '▼' : '▶' }}</span>
          <span class="unit-name">{{ unitName }}</span>
        </div>
      </div>

      <!-- Right: Content Area -->
      <div class="content-area">
        <!-- Time axis at top -->
        <div class="time-axis-wrapper">
          <div class="time-axis">
            <div v-for="marker in timeMarkers" :key="marker.id || marker.value" class="time-marker"
              :style="{ left: `${(marker.value / horizonHours) * 100}%` }">
              <span class="time-label">{{ marker.label }}</span>
            </div>
          </div>
        </div>

        <!-- Chart content slot -->
        <div class="chart-content">
          <!-- Horizon end marker -->
          <div v-if="showHorizonMarker" class="horizon-marker-chart" :style="{ left: `${horizonMarkerPosition}%` }">
            <div class="horizon-line-chart"></div>
            <span class="horizon-label-chart">End</span>
          </div>
          <slot name="chart"></slot>
        </div>
      </div>
    </div>

    <!-- Legend and selector section -->
    <div v-if="showLegend" class="legend-section">
      <!-- Left side: Legend items -->
      <div class="legend-left">
        <div v-if="legendItems && legendItems.length > 0" class="legend-items">
          <div v-for="(item, idx) in legendItems" :key="idx" class="legend-item">
            <!-- Color box -->
            <span v-if="item.color" class="legend-color" :style="{ background: item.color }"></span>
            <!-- Gradient box -->
            <div v-else-if="item.gradient" class="legend-color" :style="{ background: item.gradient }">
              <span v-if="item.text" class="legend-color-text">{{ item.text }}</span>
            </div>
            <!-- Pattern box -->
            <div v-else-if="item.pattern" class="legend-color" :style="item.colorStyle"></div>
            <!-- Line -->
            <span v-else-if="item.line" class="legend-line" :style="{ borderTop: `2px solid ${item.line}` }"></span>
            <!-- Label -->
            <span class="legend-label" :style="item.line ? { color: item.line, fontWeight: 600 } : {}">
              {{ item.label }}
              <span v-if="item.badge !== undefined" :class="['stat-badge', item.badgeClass]">{{ item.badge }}</span>
            </span>
          </div>
        </div>

        <!-- Custom legend slot for complex cases -->
        <slot name="legend"></slot>
      </div>

      <!-- Middle: Availability stats (if provided) -->
      <div v-if="availabilityPercent !== undefined || unavailabilityPercent !== undefined" class="legend-center">
        <div class="availability-stat">
          <span class="stat-label">Avg Availability:</span>
          <span class="stat-value available">
            <span v-if="availableCount !== undefined" class="stat-count">{{ availableCount }}</span>
            {{ availabilityPercent?.toFixed(1) }}%
          </span>
        </div>
        <div class="availability-stat">
          <span class="stat-label">Avg Unavailability:</span>
          <span class="stat-value unavailable">
            <span v-if="unavailableCount !== undefined" class="stat-count">{{ unavailableCount }}</span>
            {{ unavailabilityPercent?.toFixed(1) }}%
          </span>
        </div>
      </div>

      <!-- Right side: Selector (if provided) -->
      <div v-if="selectorOptions && selectorOptions.length > 0" class="legend-right">
        <label class="selector-label" for="crew-type-select">{{ selectorLabel || 'Show:' }}</label>
        <select id="crew-type-select" class="selector-dropdown" :value="selectorValue"
          @change="emit('updateSelector', ($event.target as HTMLSelectElement).value)">
          <option v-for="option in selectorOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-row-wrapper {
  display: flex;
  flex-direction: column;
}

.pagination-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  background: rgba(59, 130, 246, 0.05);
  border-bottom: 1px solid var(--border-color);
  gap: 12px;
}

.page-btn {
  padding: 4px 12px;
  background: var(--accent-blue);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.page-btn:hover:not(:disabled) {
  background: #2563eb;
}

.page-btn:disabled {
  background: var(--border-color);
  color: var(--text-muted-color);
  cursor: not-allowed;
  opacity: 0.5;
}

.page-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: center;
}

.page-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
}

.time-range {
  font-size: 0.7rem;
  color: var(--text-muted-color);
  font-family: monospace;
  white-space: nowrap;
}

.window-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.window-selector label {
  font-size: 0.7rem;
  color: var(--text-muted-color);
  font-weight: 500;
  white-space: nowrap;
}

.window-select {
  padding: 2px 6px;
  font-size: 0.7rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.window-select:hover {
  border-color: var(--accent-blue);
}

.window-select:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.height-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.height-selector label {
  font-size: 0.7rem;
  color: var(--text-muted-color);
  font-weight: 500;
  white-space: nowrap;
}

.height-select {
  padding: 2px 6px;
  font-size: 0.7rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.height-select:hover {
  border-color: var(--accent-blue);
}

.height-select:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.chart-row-layout {
  display: grid;
  grid-template-columns: 60px 1fr;
  gap: 8px;
  align-items: start;
}

.unit-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
  text-align: center;
  padding-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
}

.unit-label.clickable {
  margin-top: 25px;
  cursor: pointer;
  user-select: none;
  font-size: x-small;
  font-weight: 700;
}

.unit-label.clickable:hover {
  color: #60a5fa;
}

.label-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.expand-icon {
  font-size: 0.7rem;
  display: block;
}

.unit-name {
  font-size: 0.85rem;
}

.content-area {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.time-axis-wrapper {
  height: 20px;
  margin-bottom: 4px;
  position: relative;
}

.time-axis {
  position: relative;
  height: 20px;
}

.time-marker {
  position: absolute;
  transform: translateX(-50%);
}

.time-label {
  font-size: 0.7rem;
  color: var(--text-muted-color);
  font-family: monospace;
}

.chart-content {
  width: 100%;
  position: relative;
}

.horizon-marker-chart {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 100;
}

.horizon-line-chart {
  position: absolute;
  left: 0;
  top: -24px;
  bottom: 0;
  width: 2px;
  background: #ef4444;
  opacity: 0.7;
}

.horizon-label-chart {
  position: absolute;
  left: 4px;
  bottom: 1px;
  font-size: 0.65rem;
  color: #ef4444;
  font-weight: 700;
  background: var(--bg-color);
  padding: 1px 4px;
  border-radius: 2px;
  white-space: nowrap;
}

/* Legend section */
.legend-section {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  align-items: center;
  justify-content: space-between;
}

.selector-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
  margin-right: 8px;
}

.selector-dropdown {
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.selector-dropdown:hover {
  border-color: var(--accent-blue);
}

.selector-dropdown:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.legend-divider {
  width: 1px;
  height: 24px;
  background: var(--border-color);
  margin: 0 8px;
}

.legend-center {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  border-left: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
}

.availability-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
}

.availability-stat .stat-label {
  color: var(--text-muted-color);
  font-weight: 500;
}

.availability-stat .stat-value {
  font-weight: 700;
  font-family: monospace;
  display: flex;
  align-items: center;
  gap: 4px;
}

.availability-stat .stat-count {
  font-size: 0.9em;
  opacity: 0.8;
}

.availability-stat .stat-value.available {
  color: #22c55e;
}

.availability-stat .stat-value.unavailable {
  color: #ef4444;
}

.legend-left {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
  flex: 1;
}

.legend-right {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-left: auto;
}

.legend-items {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-color {
  width: 20px;
  height: 12px;
  border-radius: 2px;
  opacity: 0.8;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.legend-color-text {
  font-size: 0.65rem;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.legend-line {
  width: 20px;
  height: 0;
  border-top-width: 2px;
  border-top-style: solid;
}

.legend-label {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  white-space: nowrap;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  background: rgba(59, 130, 246, 0.15);
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent-blue);
  margin-left: 4px;
}

.stat-badge.stat-odo {
  background: rgba(220, 38, 38, 0.15);
  color: #dc2626;
}

.stat-badge.stat-sdo {
  background: rgba(249, 115, 22, 0.15);
  color: #ea580c;
}

.stat-badge.stat-sdnco {
  background: rgba(234, 179, 8, 0.15);
  color: #ca8a04;
}

.legend-summary {
  font-size: 0.85rem;
  color: var(--text-color);
}

.legend-summary strong {
  color: var(--accent-blue);
  font-weight: 700;
}
</style>

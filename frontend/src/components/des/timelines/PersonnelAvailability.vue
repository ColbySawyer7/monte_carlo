<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ChartRowLayout from './ChartRowLayout.vue'

interface UnavailableBreakdown {
  work_schedule: number
  leave: number
  odo: number
  sdo: number
  sdnco: number
  range: number
  medical: number
  training: number
  standdown: number
}

interface TimelinePoint {
  time: number
  day: number
  total: number
  available: number
  unavailable: UnavailableBreakdown
}

interface Props {
  pilotTimeline: TimelinePoint[] | null
  soTimeline: TimelinePoint[] | null
  intelTimeline: TimelinePoint[] | null
  horizonHours: number
  unitName: string
  selectedMos: '7318' | '7314' | '0231'
  expandedUnits: Set<string>
  timeMarkers: { value: number; label: string }[]
  colors: Record<string, string>
  maxExpandedHeight?: number
  heightOptions?: { label: string; height: number }[]
  // Pagination props
  showPagination?: boolean
  currentPage?: number
  totalPages?: number
  currentStartHour?: number
  currentEndHour?: number
  pageWindowHours?: number
  windowOptions?: { label: string; hours: number }[]
  formatTimeLabel?: (hours: number) => string
  actualHorizonHours?: number
  // Legend props
  legendItems?: any[]
  selectorOptions?: any[]
  selectorValue?: string
  showDivider?: boolean
}

interface Emits {
  (e: 'update:selectedMos', value: '7318' | '7314' | '0231'): void
  (e: 'toggleUnit', unit: string): void
  (e: 'prevPage'): void
  (e: 'nextPage'): void
  (e: 'updateWindowSize', hours: number): void
  (e: 'updateMaxHeight', height: number): void
  (e: 'updateSelector', value: string): void
}

const props = withDefaults(defineProps<Props>(), {
  maxExpandedHeight: 270
})
const emit = defineEmits<Emits>()

const isExpanded = computed(() => props.expandedUnits.has(props.unitName))
const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(1200)
const svgRef = ref<SVGSVGElement | null>(null)
const hoveredPoint = ref<TimelinePoint | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)
const showTooltip = ref(false)

const mosLabel = computed(() => {
  if (props.selectedMos === '7318') return 'Pilots (7318)'
  if (props.selectedMos === '7314') return 'SOs (7314)'
  return 'Intel (0231)'
})
const currentTimeline = computed(() => {
  if (props.selectedMos === '7318') return props.pilotTimeline
  if (props.selectedMos === '7314') return props.soTimeline
  return props.intelTimeline
})

// Calculate average availability count and percentage over the timeline
const avgAvailableCount = computed(() => {
  if (!currentTimeline.value || currentTimeline.value.length === 0) return 0
  const totalAvailable = currentTimeline.value.reduce((sum, p) => sum + p.available, 0)
  return Math.round(totalAvailable / currentTimeline.value.length)
})

const avgUnavailableCount = computed(() => {
  if (!currentTimeline.value || currentTimeline.value.length === 0) return 0
  const totalUnavailable = currentTimeline.value.reduce((sum, p) => {
    const unavailable = Object.values(p.unavailable).reduce((s, v) => s + v, 0)
    return sum + unavailable
  }, 0)
  return Math.round(totalUnavailable / currentTimeline.value.length)
})

const avgAvailabilityPercent = computed(() => {
  if (!currentTimeline.value || currentTimeline.value.length === 0) return 0
  const totalAvailable = currentTimeline.value.reduce((sum, p) => sum + p.available, 0)
  const totalPersonnel = currentTimeline.value.reduce((sum, p) => sum + p.total, 0)
  return totalPersonnel > 0 ? (totalAvailable / totalPersonnel) * 100 : 0
})

const avgUnavailabilityPercent = computed(() => {
  return 100 - avgAvailabilityPercent.value
})

// Calculate max value for Y-axis
const maxPersonnel = computed(() => {
  if (!currentTimeline.value || currentTimeline.value.length === 0) return 0
  return Math.max(...currentTimeline.value.map(p => p.total))
})

// Responsive SVG dimensions
const margin = { top: 28, right: 20, bottom: 8, left: 8 }
const height = computed(() => props.maxExpandedHeight)

const chartWidth = computed(() => containerWidth.value - margin.left - margin.right)
const chartHeight = computed(() => height.value - margin.top - margin.bottom)

// Lifecycle hooks for responsive sizing
onMounted(() => {
  if (containerRef.value) {
    containerWidth.value = containerRef.value.offsetWidth

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width
      }
    })

    resizeObserver.observe(containerRef.value)

    // Clean up on unmount
    onUnmounted(() => {
      resizeObserver.disconnect()
    })
  }
})

// Accordion toggle function
const toggleExpanded = () => {
  emit('toggleUnit', props.unitName)
}

// Mouse tracking for hover tooltips
const handleMouseMove = (event: MouseEvent) => {
  if (!svgRef.value || !currentTimeline.value || currentTimeline.value.length === 0) return

  const rect = svgRef.value.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top

  // Check if mouse is within chart area
  if (mouseX < margin.left || mouseX > margin.left + chartWidth.value ||
    mouseY < margin.top || mouseY > margin.top + chartHeight.value) {
    showTooltip.value = false
    return
  }

  // Find the closest data point based on X position
  const timeAtMouse = ((mouseX - margin.left) / chartWidth.value) * props.horizonHours

  if (currentTimeline.value.length === 0) return

  let closestPoint = currentTimeline.value[0]!
  let minDistance = Math.abs(closestPoint.time - timeAtMouse)

  for (const point of currentTimeline.value) {
    const distance = Math.abs(point.time - timeAtMouse)
    if (distance < minDistance) {
      minDistance = distance
      closestPoint = point
    }
  }

  hoveredPoint.value = closestPoint
  tooltipX.value = mouseX
  tooltipY.value = mouseY
  showTooltip.value = true
}

const handleMouseLeave = () => {
  showTooltip.value = false
  hoveredPoint.value = null
}

// Format tooltip content
const tooltipContent = computed(() => {
  if (!hoveredPoint.value) return null

  const point = hoveredPoint.value
  const totalUnavailable = Object.values(point.unavailable).reduce((sum, val) => sum + val, 0)

  // Build breakdown list
  const breakdown: Array<{ label: string; count: number; color: string }> = []

  const reasons: (keyof UnavailableBreakdown)[] = [
    'work_schedule',
    'leave',
    'odo',
    'sdo',
    'sdnco',
    'range',
    'medical',
    'training',
    'standdown'
  ]

  for (const reason of reasons) {
    const count = point.unavailable[reason] || 0
    if (count > 0) {
      breakdown.push({
        label: labels[reason] || reason,
        count,
        color: props.colors[reason] || '#000000'
      })
    }
  }

  return {
    day: point.day,
    time: point.time.toFixed(1),
    total: point.total,
    available: point.available,
    totalUnavailable,
    breakdown
  }
})

// Scale functions
const xScale = computed(() => (time: number) => {
  return margin.left + (time / props.horizonHours) * chartWidth.value
})

const yScale = computed(() => (value: number) => {
  return margin.top + chartHeight.value - (value / maxPersonnel.value) * chartHeight.value
})

// Label mapping for unavailability reasons
const labels: Record<string, string> = {
  work_schedule: 'Off Schedule',
  leave: 'Leave',
  odo: 'ODO',
  sdo: 'SDO',
  sdnco: 'SDNCO',
  range: 'Range',
  medical: 'Medical',
  training: 'Training',
  standdown: 'Standdown',
}

// Generate stacked area paths
const stackedAreas = computed(() => {
  if (!currentTimeline.value || currentTimeline.value.length === 0) return []

  const reasons: (keyof UnavailableBreakdown)[] = [
    'work_schedule',
    'leave',
    'odo',
    'sdo',
    'sdnco',
    'range',
    'medical',
    'training',
    'standdown',
  ]

  const areas = []
  let cumulative = new Array(currentTimeline.value.length).fill(0)

  for (const reason of reasons) {
    const points = currentTimeline.value.map((point, i) => {
      const unavailable = point.unavailable[reason] || 0
      const y0 = cumulative[i]
      const y1 = y0 + unavailable
      cumulative[i] = y1
      return {
        x: xScale.value(point.time),
        y0: yScale.value(y0),
        y1: yScale.value(y1)
      }
    })

    // Build SVG path for this area
    if (points.length > 0 && points[0]) {
      let path = `M ${points[0].x} ${points[0].y0}`
      // Top edge
      for (let i = 0; i < points.length; i++) {
        const pt = points[i]
        if (pt) {
          path += ` L ${pt.x} ${pt.y1}`
        }
      }
      // Bottom edge (reverse)
      for (let i = points.length - 1; i >= 0; i--) {
        const pt = points[i]
        if (pt) {
          path += ` L ${pt.x} ${pt.y0}`
        }
      }
      path += ' Z'

      areas.push({
        reason,
        color: props.colors[reason] || '#000000',
        label: labels[reason] || reason,
        path
      })
    }
  }

  return areas
})

// Available line (top of unavailable stack)
const availableLine = computed(() => {
  if (!currentTimeline.value || currentTimeline.value.length === 0) return ''

  const points = currentTimeline.value.map(point => {
    const totalUnavailable = Object.values(point.unavailable).reduce((sum, val) => sum + val, 0)
    return {
      x: xScale.value(point.time),
      y: yScale.value(totalUnavailable)
    }
  })

  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
})

// Y-axis ticks
const yTicks = computed(() => {
  const ticks = []
  const step = Math.ceil(maxPersonnel.value / 5)
  for (let val = 0; val <= maxPersonnel.value; val += step) {
    ticks.push({
      y: yScale.value(val),
      label: val
    })
  }
  return ticks
})

// Collapsed view data - simplified stacked bars
const collapsedViewData = computed(() => {
  if (!currentTimeline.value || currentTimeline.value.length === 0) return []

  const reasons: (keyof UnavailableBreakdown)[] = [
    'work_schedule',
    'leave',
    'odo',
    'sdo',
    'sdnco',
    'range',
    'medical',
    'training',
    'standdown'
  ]

  const timelineLength = currentTimeline.value.length

  return currentTimeline.value.map(point => {
    let cumulative = 0
    const segments = reasons.map(reason => {
      const value = point.unavailable[reason] || 0
      const y = 32 - ((cumulative + value) / maxPersonnel.value) * 32
      cumulative += value
      return {
        reason,
        x: (point.time / props.horizonHours) * containerWidth.value,
        y,
        width: Math.max(2, (containerWidth.value / timelineLength)),
        height: (value / maxPersonnel.value) * 32,
        color: props.colors[reason] || '#000000',
        label: labels[reason] || reason,
        value
      }
    }).filter(seg => seg.value > 0)

    return segments
  }).flat()
})
</script>

<template>
  <ChartRowLayout :unit-name="unitName" :horizon-hours="props.horizonHours" :time-markers="timeMarkers"
    :is-expanded="isExpanded" :show-pagination="showPagination" :current-page="currentPage" :total-pages="totalPages"
    :current-start-hour="currentStartHour" :current-end-hour="currentEndHour" :page-window-hours="pageWindowHours"
    :window-options="windowOptions" :max-expanded-height="maxExpandedHeight" :height-options="heightOptions"
    :format-time-label="formatTimeLabel" :actual-horizon-hours="actualHorizonHours"
    :show-legend="legendItems !== undefined" :legend-items="legendItems" :selector-options="selectorOptions"
    :selector-value="selectorValue" :show-divider="showDivider" :availability-percent="avgAvailabilityPercent"
    :unavailability-percent="avgUnavailabilityPercent" :available-count="avgAvailableCount"
    :unavailable-count="avgUnavailableCount" @toggle="toggleExpanded" @prev-page="emit('prevPage')"
    @next-page="emit('nextPage')" @update-window-size="emit('updateWindowSize', $event)"
    @update-max-height="emit('updateMaxHeight', $event)" @update-selector="emit('updateSelector', $event)">
    <template #chart>
      <div class="availability-chart" ref="containerRef">
        <div v-if="!currentTimeline || currentTimeline.length === 0" class="no-data">
          No availability data available for {{ mosLabel }}
        </div>

        <!-- Collapsed view: simplified stacked bar -->
        <div v-else-if="!isExpanded" class="collapsed-view">
          <svg :width="containerWidth" :height="32" class="collapsed-svg">
            <!-- Render stacked segments using computed data -->
            <rect v-for="(segment, idx) in collapsedViewData" :key="idx" :x="segment.x" :y="segment.y"
              :width="segment.width" :height="segment.height" :fill="segment.color" opacity="0.8">
              <title>{{ segment.label }}: {{ segment.value }}</title>
            </rect>
          </svg>
        </div>

        <!-- Expanded view: full chart -->
        <svg v-else :width="containerWidth" :height="height" class="chart-svg" ref="svgRef" @mousemove="handleMouseMove"
          @mouseleave="handleMouseLeave">
          <!-- Grid lines -->
          <g class="grid">
            <line v-for="tick in yTicks" :key="tick.label" :x1="margin.left" :x2="margin.left + chartWidth" :y1="tick.y"
              :y2="tick.y" stroke="#e5e7eb" stroke-width="1" />
          </g>

          <!-- Stacked areas -->
          <g class="areas">
            <path v-for="area in stackedAreas" :key="area.reason" :d="area.path" :fill="area.color" opacity="0.8" />
          </g>

          <!-- Available line -->
          <path :d="availableLine" fill="none" :stroke="colors.available" stroke-width="2" />

          <!-- Invisible hover area covering entire chart for better interaction -->
          <rect :x="margin.left" :y="margin.top" :width="chartWidth" :height="chartHeight" fill="transparent"
            style="pointer-events: all; cursor: crosshair;" />

          <!-- Vertical line indicator -->
          <line v-if="showTooltip && hoveredPoint" :x1="xScale(hoveredPoint.time)" :x2="xScale(hoveredPoint.time)"
            :y1="margin.top" :y2="margin.top + chartHeight" stroke="#3b82f6" stroke-width="1" stroke-dasharray="4,2"
            opacity="0.6" />
        </svg>

        <!-- Tooltip - positioned absolutely outside SVG to appear on top of everything -->
        <div v-if="showTooltip && tooltipContent" class="tooltip-box" :style="{
          left: `${tooltipX > containerWidth / 2 ? tooltipX - 300 : tooltipX + 10}px`,
          top: `${Math.max(0, Math.min(tooltipY - 60, height - 280))}px`
        }">
          <div class="tooltip-header">
            <strong>Day {{ tooltipContent.day }}</strong>
            <span class="tooltip-time">({{ tooltipContent.time }}h)</span>
          </div>
          <div class="tooltip-section">
            <div class="tooltip-row total">
              <span>Total Personnel:</span>
              <strong>{{ tooltipContent.total }}</strong>
            </div>
            <div class="tooltip-row available">
              <span>Available:</span>
              <strong :style="{ color: colors.available }">{{ tooltipContent.available }}</strong>
            </div>
            <div class="tooltip-row unavailable">
              <span>Unavailable:</span>
              <strong :style="{ color: colors.rejection }">{{ tooltipContent.totalUnavailable }}</strong>
            </div>
          </div>
          <div v-if="tooltipContent.breakdown.length > 0" class="tooltip-breakdown">
            <div class="tooltip-breakdown-title">Unavailable Due To:</div>
            <div v-for="item in tooltipContent.breakdown" :key="item.label" class="tooltip-breakdown-item">
              <span class="tooltip-color-dot" :style="{ backgroundColor: item.color }"></span>
              <span class="tooltip-breakdown-label">{{ item.label }}:</span>
              <span class="tooltip-breakdown-value">{{ item.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #legend>
      <slot name="legend"></slot>
    </template>
  </ChartRowLayout>
</template>

<style scoped>
.availability-chart {
  width: 100%;
  position: relative;
}

.collapsed-view {
  width: 100%;
  height: 32px;
}

.collapsed-svg {
  display: block;
  width: 100%;
  height: 32px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.chart-svg {
  display: block;
  width: 100%;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: visible;
}

.no-data {
  padding: 20px;
  text-align: center;
  color: var(--text-muted-color);
  font-style: italic;
  font-size: 0.85rem;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

/* Tooltip styles */
.tooltip-box {
  position: absolute;
  background: var(--panel-color);
  border: 2px solid var(--accent-blue);
  border-radius: 6px;
  padding: 10px;
  font-size: 0.8rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  z-index: 9999;
  max-height: 270px;
  overflow-y: auto;
  width: 210px;
}

.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-color);
}

.tooltip-time {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-weight: normal;
}

.tooltip-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-color);
  font-size: 0.8rem;
}

.tooltip-breakdown {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
}

.tooltip-breakdown-title {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  margin-bottom: 4px;
  font-weight: 600;
}

.tooltip-breakdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
  font-size: 0.75rem;
  color: var(--text-color);
}

.tooltip-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
  opacity: 0.8;
}

.tooltip-breakdown-label {
  flex: 1;
  color: var(--text-muted-color);
}

.tooltip-breakdown-value {
  font-weight: 600;
  color: var(--text-color);
}
</style>

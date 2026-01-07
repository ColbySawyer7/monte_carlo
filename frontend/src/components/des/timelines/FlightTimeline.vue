<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { computed } from 'vue'
import ChartRowLayout from './ChartRowLayout.vue'

interface TimelineEvent {
  unit: string
  start: number
  end: number
  phase: 'preflight' | 'mount' | 'transit_in' | 'flight' | 'transit_out' | 'postflight' | 'turnaround' | 'rejection'
  missionType?: string
  missionId?: number
  rejectionReason?: string
}

interface Props {
  timeline?: TimelineEvent[]
  horizonHours: number
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
  // Unit configuration props
  unitSplit?: { vmu1: number; vmu3: number }
  initialResources?: {
    units?: string[]
    aircraftByUnit?: Record<string, number>
    staffingByUnit?: Record<string, { pilot?: number; so?: number; intel?: number }>
    payloadByUnit?: Record<string, Record<string, number>>
  }
}

const props = withDefaults(defineProps<Props>(), {
  timeline: () => [],
  maxExpandedHeight: 270,
  showPagination: false
})

const emit = defineEmits<{
  toggleUnit: [unit: string]
  prevPage: []
  nextPage: []
  updateWindowSize: [hours: number]
  updateMaxHeight: [height: number]
  updateSelector: [value: string]
}>()

function toggleUnit(unit: string) {
  emit('toggleUnit', unit)
}

// Get unique units from timeline - include all units (even if only rejections)
// Also include units from initialResources or unitSplit to ensure all configured units are shown
const units = computed(() => {
  const unitSet = new Set<string>()
  
  // First, add units from timeline events (missions, rejections, etc.)
  for (const event of props.timeline) {
    if (event.unit) {
      unitSet.add(event.unit)
    }
  }
  
  // Also add units from initialResources if available
  if (props.initialResources?.units) {
    for (const unit of props.initialResources.units) {
      // Only add units with non-zero mission split
      if (unit === 'VMU-1' && props.unitSplit && props.unitSplit.vmu1 > 0) {
        unitSet.add(unit)
      } else if (unit === 'VMU-3' && props.unitSplit && props.unitSplit.vmu3 > 0) {
        unitSet.add(unit)
      } else if (unit !== 'VMU-1' && unit !== 'VMU-3') {
        // Add other units as-is
        unitSet.add(unit)
      }
    }
  }
  
  // Fallback: add units from unitSplit if initialResources not available
  if (unitSet.size === 0 && props.unitSplit) {
    if (props.unitSplit.vmu1 > 0) {
      unitSet.add('VMU-1')
    }
    if (props.unitSplit.vmu3 > 0) {
      unitSet.add('VMU-3')
    }
  }
  
  return Array.from(unitSet).sort()
})

// Get events for a specific unit (excluding rejections)
function getEventsForUnit(unit: string): TimelineEvent[] {
  return props.timeline.filter(e => e.unit === unit && e.phase !== 'rejection')
}

// Get rejection markers for a specific unit
function getRejectionsForUnit(unit: string): TimelineEvent[] {
  return props.timeline.filter(e => e.unit === unit && e.phase === 'rejection')
}

// Assign events to lanes to avoid overlap when expanded
// All segments of the same mission stay on the same lane
function assignLanes(events: TimelineEvent[]): Array<{ event: TimelineEvent; lane: number; isFirstSegment: boolean; isLastSegment: boolean }> {
  // Group events by mission
  const missions = new Map<number, TimelineEvent[]>()
  const otherEvents: TimelineEvent[] = []

  for (const event of events) {
    if (event.missionId !== undefined) {
      if (!missions.has(event.missionId)) {
        missions.set(event.missionId, [])
      }
      missions.get(event.missionId)!.push(event)
    } else {
      otherEvents.push(event)
    }
  }

  // Get mission start/end times (based on earliest start and latest end of all segments)
  const missionBounds = Array.from(missions.entries()).map(([missionId, segments]) => {
    // Sort segments by start time to identify first and last
    const sortedSegments = [...segments].sort((a, b) => a.start - b.start)
    const starts = segments.map(s => s.start)
    const ends = segments.map(s => s.end)
    return {
      missionId,
      segments: sortedSegments,
      start: Math.min(...starts),
      end: Math.max(...ends)
    }
  })

  // Sort missions by start time
  missionBounds.sort((a, b) => a.start - b.start)

  // Assign lanes to missions
  const lanes: Array<{ end: number }> = []
  const result: Array<{ event: TimelineEvent; lane: number; isFirstSegment: boolean; isLastSegment: boolean }> = []

  for (const mission of missionBounds) {
    // Find first available lane for this entire mission
    let laneIdx = lanes.findIndex(lane => lane.end <= mission.start)

    if (laneIdx === -1) {
      // Create new lane
      laneIdx = lanes.length
      lanes.push({ end: mission.end })
    } else {
      // Update lane end time
      const lane = lanes[laneIdx]
      if (lane) {
        lane.end = mission.end
      }
    }

    // Assign all segments of this mission to the same lane
    for (let i = 0; i < mission.segments.length; i++) {
      const segment = mission.segments[i]
      if (segment) {
        result.push({
          event: segment,
          lane: laneIdx,
          isFirstSegment: i === 0,
          isLastSegment: i === mission.segments.length - 1
        })
      }
    }
  }

  // Handle other events (like rejections) - put them in first available lane
  for (const event of otherEvents) {
    let laneIdx = lanes.findIndex(lane => lane.end <= event.start)
    if (laneIdx === -1) {
      laneIdx = 0 // Put in first lane if no space
    }
    result.push({ event, lane: laneIdx, isFirstSegment: true, isLastSegment: true })
  }

  return result
}// Calculate position and width percentages
function getEventStyle(event: TimelineEvent, lane?: number, totalLanes?: number) {
  const left = (event.start / props.horizonHours) * 100
  const width = ((event.end - event.start) / props.horizonHours) * 100

  if (lane !== undefined && totalLanes !== undefined && totalLanes > 0) {
    const laneHeightPx = 28 // Fixed pixel height per lane
    const topPx = lane * laneHeightPx
    return {
      left: `${left}%`,
      width: `${width}%`,
      top: `${topPx}px`,
      height: `${laneHeightPx - 4}px` // 4px gap between lanes
    }
  }

  return {
    left: `${left}%`,
    width: `${width}%`
  }
}

// Calculate position for rejection marker
function getRejectionStyle(event: TimelineEvent, lane?: number, totalLanes?: number) {
  const left = (event.start / props.horizonHours) * 100

  if (lane !== undefined && totalLanes !== undefined && totalLanes > 0) {
    const laneHeight = 100 / totalLanes
    const topPercent = (lane * laneHeight) + (laneHeight / 2)
    return {
      left: `${left}%`,
      top: `${topPercent}%`
    }
  }

  return {
    left: `${left}%`
  }
}

// Get phase label
function getPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    preflight: 'Preflight',
    mount: 'Mount',
    transit_in: 'Transit In',
    flight: 'On Station',
    transit_out: 'Transit Out',
    postflight: 'Postflight',
    turnaround: 'Turnaround',
    rejection: 'Rejection'
  }
  return labels[phase] || phase
}
</script>

<template>
  <div class="timeline-container">
    <div class="timeline-content">
      <!-- Unit rows -->
      <div class="units-container">
        <ChartRowLayout v-for="(unit, index) in units" :key="unit" :unit-name="unit" :horizon-hours="horizonHours"
          :time-markers="timeMarkers" :is-expanded="expandedUnits.has(unit)"
          :show-pagination="showPagination && index === 0" :current-page="currentPage" :total-pages="totalPages"
          :current-start-hour="currentStartHour" :current-end-hour="currentEndHour" :page-window-hours="pageWindowHours"
          :window-options="windowOptions" :max-expanded-height="maxExpandedHeight" :height-options="heightOptions"
          :format-time-label="formatTimeLabel" :actual-horizon-hours="actualHorizonHours"
          :show-legend="index === units.length - 1 && legendItems !== undefined" :legend-items="legendItems"
          :selector-options="selectorOptions" :selector-value="selectorValue" :show-divider="showDivider"
          @toggle="toggleUnit(unit)" @prev-page="emit('prevPage')" @next-page="emit('nextPage')"
          @update-window-size="emit('updateWindowSize', $event)" @update-max-height="emit('updateMaxHeight', $event)"
          @update-selector="emit('updateSelector', $event)">
          <template #chart>
            <div class="unit-timeline" :class="{ 'expanded': expandedUnits.has(unit) }"
              :style="expandedUnits.has(unit) ? { height: `${maxExpandedHeight}px` } : {}">
              <!-- Grid lines -->
              <div class="grid-lines">
                <div v-for="marker in timeMarkers" :key="marker.value" class="grid-line"
                  :style="{ left: `${(marker.value / horizonHours) * 100}%` }"></div>
              </div>

              <!-- Collapsed view: all events stacked -->
              <template v-if="!expandedUnits.has(unit)">
                <template v-for="({ event, isFirstSegment, isLastSegment }) in assignLanes(getEventsForUnit(unit))"
                  :key="`event-${event.start}-${event.phase}`">
                  <div class="timeline-event" :class="[
                    `event-${event.phase}`,
                    { 'first-segment': isFirstSegment, 'last-segment': isLastSegment }
                  ]" :style="getEventStyle(event)"
                    :title="`${getPhaseLabel(event.phase)}: ${(event.start ?? 0).toFixed(2)}h - ${(event.end ?? 0).toFixed(2)}h`">
                    <span v-if="event.missionId !== undefined && event.phase === 'flight'" class="mission-number">{{
                      event.missionId }}</span>
                  </div>
                </template>

                <!-- Rejection markers (collapsed - point markers) -->
                <div v-for="(rejection, idx) in getRejectionsForUnit(unit)" :key="`reject-${idx}`"
                  class="rejection-marker" :style="getRejectionStyle(rejection)"
                  :title="`Rejection at ${(rejection.start ?? 0).toFixed(2)}h - ${rejection.missionType || 'Unknown'}${rejection.rejectionReason ? ' (no ' + rejection.rejectionReason + ')' : ''}`">
                  ✕
                </div>
              </template>

              <!-- Expanded view: events in separate lanes -->
              <template v-else>
                <template
                  v-for="({ event, lane, isFirstSegment, isLastSegment }) in assignLanes(getEventsForUnit(unit))"
                  :key="`event-${event.start}-${event.phase}`">
                  <div class="timeline-event" :class="[
                    `event-${event.phase}`,
                    { 'first-segment': isFirstSegment, 'last-segment': isLastSegment }
                  ]"
                    :style="getEventStyle(event, lane, assignLanes(getEventsForUnit(unit)).reduce((max, item) => Math.max(max, item.lane + 1), 0))"
                    :title="`${getPhaseLabel(event.phase)}: ${(event.start ?? 0).toFixed(2)}h - ${(event.end ?? 0).toFixed(2)}h`">
                    <span v-if="event.missionId !== undefined && event.phase === 'flight'" class="mission-number">{{
                      event.missionId }}</span>
                  </div>
                </template>

                <!-- Rejection markers (expanded - vertical lines spanning full height) -->
                <template v-for="(rejection) in getRejectionsForUnit(unit)"
                  :key="`reject-${rejection.start}-${rejection.missionType}`">
                  <div class="rejection-line" :style="{ left: `${(rejection.start / horizonHours) * 100}%` }"
                    :title="`Rejection at ${(rejection.start ?? 0).toFixed(2)}h - ${rejection.missionType || 'Unknown'}${rejection.rejectionReason ? ' (no ' + rejection.rejectionReason + ')' : ''}`">
                    <div class="rejection-line-marker">✕</div>
                  </div>
                </template>
              </template>
            </div>
          </template>
          <template #legend>
            <slot name="legend"></slot>
          </template>
        </ChartRowLayout>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-container {
  display: block;
}

h3 {
  margin: 0 0 16px 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.units-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.unit-timeline {
  position: relative;
  height: 32px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  overflow-y: auto;
  transition: height 0.3s ease;
}

.grid-lines {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.grid-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(0, 0, 0, 0.1);
}

.timeline-event {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border-radius: 0;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.timeline-event.first-segment {
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
}

.timeline-event.last-segment {
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
}

.mission-number {
  font-size: 0.7rem;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  white-space: nowrap;
}

.timeline-event:hover {
  opacity: 0.8;
  cursor: pointer;
}

.event-preflight {
  background: v-bind('colors.preflight');
}

.event-mount {
  background: v-bind('colors.mount');
}

.event-transit_in {
  background: v-bind('colors.transit_in');
}

.event-flight {
  background: v-bind('colors.flight');
}

.event-transit_out {
  background: v-bind('colors.transit_out');
}

.event-postflight {
  background: v-bind('colors.postflight');
}

.event-turnaround {
  background: v-bind('colors.turnaround');
}

.rejection-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: v-bind('colors.rejection');
  color: white;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  z-index: 10;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.rejection-marker:hover {
  background: #dc2626;
  transform: translate(-50%, -50%) scale(1.2);
}

/* Rejection line for expanded view */
.rejection-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: v-bind('colors.rejection');
  transform: translateX(-50%);
  cursor: pointer;
  z-index: 10;
  opacity: 0.8;
}

.rejection-line:hover {
  opacity: 1;
  width: 3px;
}

.rejection-line-marker {
  position: absolute;
  bottom: 0px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: v-bind('colors.rejection');
  color: white;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.rejection-line:hover .rejection-line-marker {
  background: #dc2626;
  transform: translateX(-50%) scale(1.1);
}
</style>

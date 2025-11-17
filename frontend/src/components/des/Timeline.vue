<script setup lang="ts">
import { computed, ref } from 'vue'

interface TimelineEvent {
  unit: string
  start: number
  end: number
  phase: 'preflight' | 'mount' | 'flight' | 'postflight' | 'turnaround' | 'rejection'
  missionType?: string
  missionId?: number
  rejectionReason?: string
}

interface Props {
  timeline?: TimelineEvent[]
  horizonHours: number
}

const props = withDefaults(defineProps<Props>(), {
  timeline: () => []
})

// Expanded unit state (can have multiple expanded)
const expandedUnits = ref<Set<string>>(new Set())

function toggleUnit(unit: string) {
  if (expandedUnits.value.has(unit)) {
    expandedUnits.value.delete(unit)
  } else {
    expandedUnits.value.add(unit)
  }
  // Trigger reactivity
  expandedUnits.value = new Set(expandedUnits.value)
}

// Get unique units from timeline
const units = computed(() => {
  const unitSet = new Set(props.timeline.map(e => e.unit))
  // Default to VMU-1 and VMU-3 if no timeline data
  return unitSet.size > 0 ? Array.from(unitSet).sort() : ['VMU-1', 'VMU-3']
})

// Generate hour markers
const hourMarkers = computed(() => {
  const markers = []
  for (let i = 0; i <= props.horizonHours; i++) {
    markers.push(i)
  }
  return markers
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
function assignLanes(events: TimelineEvent[]): Array<{ event: TimelineEvent; lane: number }> {
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
    const starts = segments.map(s => s.start)
    const ends = segments.map(s => s.end)
    return {
      missionId,
      segments,
      start: Math.min(...starts),
      end: Math.max(...ends)
    }
  })

  // Sort missions by start time
  missionBounds.sort((a, b) => a.start - b.start)

  // Assign lanes to missions
  const lanes: Array<{ end: number }> = []
  const result: Array<{ event: TimelineEvent; lane: number }> = []

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
    for (const segment of mission.segments) {
      result.push({ event: segment, lane: laneIdx })
    }
  }

  // Handle other events (like rejections) - put them in first available lane
  for (const event of otherEvents) {
    let laneIdx = lanes.findIndex(lane => lane.end <= event.start)
    if (laneIdx === -1) {
      laneIdx = 0 // Put in first lane if no space
    }
    result.push({ event, lane: laneIdx })
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
    flight: 'Flight',
    postflight: 'Postflight',
    turnaround: 'Turnaround',
    rejection: 'Rejection'
  }
  return labels[phase] || phase
}
</script>

<template>
  <div class="timeline-container">
    <div class="timeline-header">
      <h3>Timeline</h3>
    </div>

    <div class="timeline-content">
      <!-- Time axis -->
      <div class="time-axis-wrapper">
        <div class="time-axis-spacer"></div>
        <div class="time-axis">
          <div class="time-marker" v-for="hour in hourMarkers" :key="hour"
            :style="{ left: `${(hour / horizonHours) * 100}%` }">
            <span class="time-label">{{ hour }}h</span>
          </div>
        </div>
      </div>

      <!-- Unit rows -->
      <div class="units-container">
        <div v-for="unit in units" :key="unit" class="unit-row" :class="{ 'expanded': expandedUnits.has(unit) }">
          <div class="unit-label" @click="toggleUnit(unit)" :class="{ 'clickable': true }">
            <span class="expand-icon">{{ expandedUnits.has(unit) ? '▼' : '▶' }}</span>
            {{ unit }}
          </div>
          <div class="unit-timeline" :class="{ 'expanded': expandedUnits.has(unit) }"
            :style="expandedUnits.has(unit) ? { height: `${Math.max(assignLanes(getEventsForUnit(unit)).reduce((max, item) => Math.max(max, item.lane + 1), 1) * 28, 32)}px` } : {}">
            <!-- Grid lines -->
            <div class="grid-lines">
              <div v-for="hour in hourMarkers" :key="hour" class="grid-line"
                :style="{ left: `${(hour / horizonHours) * 100}%` }"></div>
            </div>

            <!-- Collapsed view: all events stacked -->
            <template v-if="!expandedUnits.has(unit)">
              <div v-for="(event, idx) in getEventsForUnit(unit)" :key="`event-${idx}`" class="timeline-event"
                :class="`event-${event.phase}`" :style="getEventStyle(event)"
                :title="`${getPhaseLabel(event.phase)}: ${(event.start ?? 0).toFixed(2)}h - ${(event.end ?? 0).toFixed(2)}h`">
              </div>

              <!-- Rejection markers (collapsed - point markers) -->
              <div v-for="(rejection, idx) in getRejectionsForUnit(unit)" :key="`reject-${idx}`"
                class="rejection-marker" :style="getRejectionStyle(rejection)"
                :title="`Rejection at ${(rejection.start ?? 0).toFixed(2)}h - ${rejection.missionType || 'Unknown'}${rejection.rejectionReason ? ' (no ' + rejection.rejectionReason + ')' : ''}`">
                ✕
              </div>
            </template>

            <!-- Expanded view: events in separate lanes -->
            <template v-else>
              <template v-for="({ event, lane }) in assignLanes(getEventsForUnit(unit))" :key="`event-${event.start}-${event.phase}`">
                <div class="timeline-event" :class="`event-${event.phase}`"
                  :style="getEventStyle(event, lane, assignLanes(getEventsForUnit(unit)).reduce((max, item) => Math.max(max, item.lane + 1), 0))"
                  :title="`${getPhaseLabel(event.phase)}: ${(event.start ?? 0).toFixed(2)}h - ${(event.end ?? 0).toFixed(2)}h`">
                </div>
              </template>

              <!-- Rejection markers (expanded - vertical lines spanning full height) -->
              <template v-for="(rejection) in getRejectionsForUnit(unit)" :key="`reject-${rejection.start}-${rejection.missionType}`">
                <div class="rejection-line" :style="{ left: `${(rejection.start / horizonHours) * 100}%` }"
                  :title="`Rejection at ${(rejection.start ?? 0).toFixed(2)}h - ${rejection.missionType || 'Unknown'}${rejection.rejectionReason ? ' (no ' + rejection.rejectionReason + ')' : ''}`">
                  <div class="rejection-line-marker">✕</div>
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>

      <!-- Legend -->
      <div class="timeline-legend">
        <div class="legend-item">
          <span class="legend-color preflight"></span>
          <span class="legend-label">Preflight</span>
        </div>
        <div class="legend-item">
          <span class="legend-color mount"></span>
          <span class="legend-label">Mount</span>
        </div>
        <div class="legend-item">
          <span class="legend-color flight"></span>
          <span class="legend-label">Flight</span>
        </div>
        <div class="legend-item">
          <span class="legend-color postflight"></span>
          <span class="legend-label">Postflight</span>
        </div>
        <div class="legend-item">
          <span class="legend-color turnaround"></span>
          <span class="legend-label">Turnaround</span>
        </div>
        <div class="legend-item">
          <span class="legend-color rejection"></span>
          <span class="legend-label">Rejection</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-container {
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.timeline-header h3 {
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

.time-axis-wrapper {
  display: grid;
  grid-template-columns: 60px 1fr;
  gap: 8px;
  margin-bottom: 4px;
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

.units-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.unit-row {
  display: grid;
  grid-template-columns: 60px 1fr;
  gap: 8px;
  align-items: start;
}

.unit-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
  text-align: right;
  padding-right: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.unit-label.clickable {
  cursor: pointer;
  user-select: none;
}

.unit-label.clickable:hover {
  color: #60a5fa;
}

.expand-icon {
  font-size: 0.7rem;
  display: inline-block;
  width: 12px;
}

.unit-timeline {
  position: relative;
  height: 32px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
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
  border-radius: 2px;
  transition: opacity 0.2s;
}

.timeline-event:hover {
  opacity: 0.8;
  cursor: pointer;
}

.event-preflight {
  background: #60a5fa;
}

.event-mount {
  background: #a78bfa;
}

.event-flight {
  background: #34d399;
}

.event-postflight {
  background: #fbbf24;
}

.event-turnaround {
  background: #9ca3af;
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
  background: #ef4444;
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
  background: #ef4444;
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
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ef4444;
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

.timeline-legend {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 3px;
}

.legend-color.preflight {
  background: #60a5fa;
}

.legend-color.mount {
  background: #a78bfa;
}

.legend-color.flight {
  background: #34d399;
}

.legend-color.postflight {
  background: #fbbf24;
}

.legend-color.turnaround {
  background: #9ca3af;
}

.legend-color.rejection {
  background: #ef4444;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 10px;
  font-weight: bold;
}

.legend-color.rejection::before {
  content: '✕';
}

.legend-label {
  font-size: 0.8rem;
  color: var(--text-muted-color);
}
</style>

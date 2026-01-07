<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { ref, computed, onMounted, watch } from 'vue'
import { load, save } from '../../composables/useLocalStorage'
import FlightTimeline from './timelines/FlightTimeline.vue'
import PersonnelTimeline from './timelines/PersonnelTimeline.vue'
import PersonnelAvailability from './timelines/PersonnelAvailability.vue'

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
  rawTimeline?: any[]  // Raw timeline with crew assignments
  availabilityTimeline?: any
  horizonHours: number
  unitSplit: { vmu1: number; vmu3: number }
  personnelAvailability?: {
    '7318'?: { daily_crew_rest_hours?: number }
    '7314'?: { daily_crew_rest_hours?: number }
    '0231'?: { daily_crew_rest_hours?: number }
  }
  initialResources?: {
    staffingByUnit?: Record<string, { pilot?: number; so?: number; intel?: number }>
  }
  utilization?: Record<string, {
    effective_crew?: { pilot?: number; so?: number; intel?: number }
  }>
}

const props = defineProps<Props>()

const activeTab = ref<'flight' | 'personnel' | 'availability'>('flight')
const selectedAvailabilityMos = ref<'7318' | '7314' | '0231'>('7318')
const selectedCrewType = ref<'pilot' | 'so' | 'intel'>('pilot')

// Reference to PersonnelTimeline component
const personnelTimelineRef = ref<InstanceType<typeof PersonnelTimeline> | null>(null)

// Sync crew type selection between Personnel Timeline and Availability Timeline
watch(selectedCrewType, (newCrewType) => {
  selectedAvailabilityMos.value = newCrewType === 'pilot' ? '7318' : newCrewType === 'so' ? '7314' : '0231'
})

watch(selectedAvailabilityMos, (newMos) => {
  selectedCrewType.value = newMos === '7318' ? 'pilot' : newMos === '7314' ? 'so' : 'intel'
})

// Computed property to get crew stats from the PersonnelTimeline component
const crewStats = computed(() => {
  return personnelTimelineRef.value?.crewStats || {
    totalUsed: 0,
    totalAvailable: 0,
    totalEffective: 0,
    flownMissions: 0,
    odoCount: 0,
    sdoCount: 0,
    sdncoCount: 0
  }
})

// Pagination state
const currentPage = ref(0)
const pageWindowHours = ref(24) // Default: 1 day (24 hours)

// Window size options (in hours) - allow at least one option beyond the horizon
const windowOptions = computed((): { label: string; hours: number }[] => {
  const allOptions: { label: string; hours: number }[] = [
    { label: '1 Day', hours: 24 },
    { label: '2 Days', hours: 48 },
    { label: '3 Days', hours: 72 },
    { label: '1 Week', hours: 168 },
    { label: '2 Weeks', hours: 336 },
    { label: '3 Weeks', hours: 504 },
    { label: '1 Month', hours: 720 },
    { label: '2 Months', hours: 1440 },
    { label: '3 Months', hours: 2160 }
  ]

  // Find options that fit within horizon
  const withinHorizon = allOptions.filter(option => option.hours <= props.horizonHours)

  // If we have options within horizon, include at least one more beyond it
  if (withinHorizon.length > 0 && withinHorizon.length < allOptions.length) {
    // Add the next option after the last one that fits
    return [...withinHorizon, allOptions[withinHorizon.length]!]
  }

  // If no options fit, return at least the first option
  if (withinHorizon.length === 0) {
    return [allOptions[0]!]
  }

  // If all options fit, return all
  return allOptions
})

// Max height options for expanded timelines (in pixels)
const maxHeightOptions = [
  { label: 'Small', height: 150 },
  { label: 'Medium', height: 300 },
  { label: 'Large', height: 450 },
  { label: 'X-Large', height: 600 }
]

const maxExpandedHeight = ref(300) // Default: Medium

// Compute pagination settings - always use pageWindowHours as the display window
const totalPages = computed(() => Math.max(1, Math.ceil(props.horizonHours / pageWindowHours.value)))
const currentStartHour = computed(() => currentPage.value * pageWindowHours.value)
const currentEndHour = computed(() => (currentPage.value + 1) * pageWindowHours.value)
// Always show full window based on pageWindowHours
const displayHorizonHours = computed(() => pageWindowHours.value)

// Reset to first page when horizon changes significantly
watch(() => props.horizonHours, () => {
  currentPage.value = 0
})

// Reset to first page when window size changes
watch(pageWindowHours, () => {
  currentPage.value = 0
})

// Pagination controls
function nextPage() {
  if (currentPage.value < totalPages.value - 1) {
    currentPage.value++
  }
}

function prevPage() {
  if (currentPage.value > 0) {
    currentPage.value--
  }
}

// Shared accordion state for both tabs
const expandedUnits = ref<Set<string>>(new Set())

// Load saved state from localStorage on mount
onMounted(() => {
  const savedTab = load<string>('desTimelineActiveTab')
  if (savedTab && (savedTab === 'flight' || savedTab === 'personnel' || savedTab === 'availability')) {
    activeTab.value = savedTab as 'flight' | 'personnel' | 'availability'
  }

  const savedExpandedUnits = load<string[]>('desTimelineExpandedUnits')
  if (savedExpandedUnits && Array.isArray(savedExpandedUnits)) {
    expandedUnits.value = new Set(savedExpandedUnits)
  }

  const savedMos = load<string>('desTimelineSelectedMos')
  if (savedMos && (savedMos === '7318' || savedMos === '7314' || savedMos === '0231')) {
    selectedAvailabilityMos.value = savedMos as '7318' | '7314' | '0231'
  }

  const savedCrewType = load<string>('desTimelineSelectedCrewType')
  if (savedCrewType && (savedCrewType === 'pilot' || savedCrewType === 'so' || savedCrewType === 'intel')) {
    selectedCrewType.value = savedCrewType as 'pilot' | 'so' | 'intel'
  }

  const savedMaxHeight = load<number>('desTimelineMaxHeight')
  if (savedMaxHeight && !isNaN(savedMaxHeight) && maxHeightOptions.some(opt => opt.height === savedMaxHeight)) {
    maxExpandedHeight.value = savedMaxHeight
  }
})

// Save state to localStorage when it changes
watch(activeTab, (newTab) => {
  save('desTimelineActiveTab', newTab)
})

watch(expandedUnits, (newUnits) => {
  save('desTimelineExpandedUnits', Array.from(newUnits))
}, { deep: true })

watch(selectedAvailabilityMos, (newMos) => {
  save('desTimelineSelectedMos', newMos)
})

watch(selectedCrewType, (newType) => {
  save('desTimelineSelectedCrewType', newType)
})

watch(maxExpandedHeight, (newHeight) => {
  save('desTimelineMaxHeight', newHeight)
})

// Shared toggle function for units
function toggleUnit(unit: string) {
  if (expandedUnits.value.has(unit)) {
    expandedUnits.value.delete(unit)
  } else {
    expandedUnits.value.add(unit)
  }
  // Trigger reactivity
  expandedUnits.value = new Set(expandedUnits.value)
}

// Shared color definitions
const colors = {
  // Timeline colors
  preflight: '#60a5fa',
  mount: '#a78bfa',
  transit_in: '#059669',
  flight: '#34d399',
  transit_out: '#059669',
  postflight: '#fbbf24',
  turnaround: '#9ca3af',
  rejection: '#ef4444',
  duty_recovery: '#9ca3af',
  // Personnel availability colors
  work_schedule: '#94a3b8',
  leave: '#60a5fa',
  odo: '#1e293b',
  sdo: '#a78bfa',
  sdnco: '#c084fc',
  range: '#f59e0b',
  medical: '#fbbf24',
  training: '#fb923c',
  standdown: '#f87171',
  available: '#10b981'
}

// Legend configurations
const flightLegendItems = computed(() => [
  { color: colors.preflight, label: 'Preflight' },
  { color: colors.mount, label: 'Mount' },
  { color: colors.transit_in, label: 'Transit In' },
  { color: colors.flight, label: 'On Station' },
  { color: colors.transit_out, label: 'Transit Out' },
  { color: colors.postflight, label: 'Postflight' },
  { color: colors.turnaround, label: 'Turnaround' },
  { color: colors.rejection, label: 'Rejection' }
])

const personnelLegendItems = computed(() => [
  { pattern: true, colorStyle: 'background: rgba(34, 197, 94, 0.15); border-top: 1px solid rgba(34, 197, 94, 0.3); border-bottom: 1px solid rgba(34, 197, 94, 0.3);', label: 'Working' },
  { pattern: true, colorStyle: 'background: rgba(148, 163, 184, 0.1); border-top: 1px solid rgba(148, 163, 184, 0.2); border-bottom: 1px solid rgba(148, 163, 184, 0.2);', label: 'Crew Rest' },
  { pattern: true, colorStyle: 'background: rgba(59, 130, 246, 0.2); border-top: 1px solid rgba(59, 130, 246, 0.4); border-bottom: 1px solid rgba(59, 130, 246, 0.4);', label: 'Double Coverage' },
  { pattern: true, colorStyle: 'background: rgba(239, 68, 68, 0.2); border-top: 1px solid rgba(239, 68, 68, 0.4); border-bottom: 1px solid rgba(239, 68, 68, 0.4);', label: 'Zero Coverage' },
  { pattern: true, colorStyle: 'background: repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.1) 10px, rgba(239, 68, 68, 0.2) 10px, rgba(239, 68, 68, 0.2) 20px); border-top: 1px solid rgba(239, 68, 68, 0.4); border-bottom: 1px solid rgba(239, 68, 68, 0.4);', label: 'Days Off' },
  { gradient: 'linear-gradient(to right, #5b7a9f, #4a6280)', label: 'On Flight', badge: crewStats.value.flownMissions, text: '#' },
  ...(crewStats.value.sdoCount > 0 ? [{ gradient: 'linear-gradient(to right, #c78f5f, #b67e4e)', label: 'SDO', badge: crewStats.value.sdoCount, badgeClass: 'stat-sdo' }] : []),
  ...(crewStats.value.odoCount > 0 ? [{ gradient: 'linear-gradient(to right, #b56f7e, #a45e6d)', label: 'ODO', badge: crewStats.value.odoCount, badgeClass: 'stat-odo' }] : []),
  ...(crewStats.value.sdncoCount > 0 ? [{ gradient: 'linear-gradient(to right, #bfb06f, #ae9f5e)', label: 'SDNCO', badge: crewStats.value.sdncoCount, badgeClass: 'stat-sdnco' }] : [])
])

const personnelSelectorOptions = [
  { value: 'pilot', label: 'Pilots' },
  { value: 'so', label: 'Sensor Operators' },
  { value: 'intel', label: 'Intel' }
]

const availabilityLegendItems = [
  { color: colors.work_schedule, label: 'Off Schedule' },
  { color: colors.leave, label: 'Leave' },
  { color: colors.odo, label: 'ODO' },
  { color: colors.sdo, label: 'SDO' },
  { color: colors.sdnco, label: 'SDNCO' },
  { color: colors.range, label: 'Range' },
  { color: colors.medical, label: 'Medical' },
  { color: colors.training, label: 'Training' },
  { color: colors.standdown, label: 'Standdown' },
  { line: colors.available, label: 'Available' }
]

const availabilitySelectorOptions = [
  { value: '7318', label: 'Pilots' },
  { value: '7314', label: 'Sensor Operators' },
  { value: '0231', label: 'Intel' }
]

// Shared time formatting logic
function formatTimeLabel(hours: number): string {
  // Use the full horizon to determine format, not the current window
  const effectiveHorizon = props.horizonHours
  if (effectiveHorizon > 2190) { // > 3 months, show in days
    const days = Math.round(hours / 24)
    return `Day ${days}`
  } else if (effectiveHorizon > 168) { // > 1 week, show in days  
    const days = Math.round(hours / 24)
    return `Day ${days}`
  } else if (effectiveHorizon > 48) { // > 2 days, show day+hour
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    if (remainingHours === 0) {
      return `Day ${days}`
    }
    return `Day ${days}+${remainingHours}h`
  } else {
    return `${hours}h`
  }
}

// Filter timeline data for current page
const filteredTimeline = computed(() => {
  if (!props.timeline) return props.timeline

  return props.timeline.filter(event => {
    // Include event if it overlaps with current time window
    return event.end > currentStartHour.value && event.start < currentEndHour.value
  }).map(event => ({
    ...event,
    // Adjust event times relative to page start
    start: Math.max(0, event.start - currentStartHour.value),
    end: Math.min(displayHorizonHours.value, event.end - currentStartHour.value)
  }))
})

// Filter raw timeline for current page
const filteredRawTimeline = computed(() => {
  if (!props.rawTimeline) return props.rawTimeline

  return props.rawTimeline.map(mission => {
    // Handle crew rest assignments
    if (mission.type === 'duty_recovery') {
      const restStart = mission.start || 0
      const restEnd = mission.end || 0

      // Filter out crew rest that start beyond the actual horizon
      if (restStart >= props.horizonHours) {
        return null
      }

      // Filter out crew rest outside the current page window
      if (restEnd <= currentStartHour.value || restStart >= currentEndHour.value) {
        return null
      }

      // Adjust crew rest times relative to page start
      return {
        ...mission,
        start: Math.max(0, restStart - currentStartHour.value),
        end: Math.min(displayHorizonHours.value, restEnd - currentStartHour.value)
      }
    }

    // Handle duty assignments
    if (mission.type === 'duty') {
      const dutyStart = mission.start || 0
      const dutyEnd = mission.end || 0

      // Filter out duties that start beyond the actual horizon
      if (dutyStart >= props.horizonHours) {
        return null
      }

      // Filter out duties outside the current page window
      if (dutyEnd <= currentStartHour.value || dutyStart >= currentEndHour.value) {
        return null
      }

      // Adjust duty times relative to page start
      return {
        ...mission,
        start: Math.max(0, dutyStart - currentStartHour.value),
        end: Math.min(displayHorizonHours.value, dutyEnd - currentStartHour.value),
        crew: mission.crew ? {
          pilots: mission.crew.pilots?.map((p: any) => ({
            ...p,
            start: Math.max(0, p.start - currentStartHour.value),
            end: Math.min(displayHorizonHours.value, p.end - currentStartHour.value)
          })).filter((p: any) => p.start < displayHorizonHours.value) || [],
          sos: mission.crew.sos?.map((s: any) => ({
            ...s,
            start: Math.max(0, s.start - currentStartHour.value),
            end: Math.min(displayHorizonHours.value, s.end - currentStartHour.value)
          })).filter((s: any) => s.start < displayHorizonHours.value) || [],
          intel: mission.crew.intel?.map((i: any) => ({
            ...i,
            start: Math.max(0, i.start - currentStartHour.value),
            end: Math.min(displayHorizonHours.value, i.end - currentStartHour.value)
          })).filter((i: any) => i.start < displayHorizonHours.value) || []
        } : undefined
      }
    }

    // Handle flight missions
    if (mission.type !== 'mission' || !mission.segments) return mission

    // Check if mission overlaps with current window
    const missionStart = Math.min(...mission.segments.map((s: any) => s.start))
    const missionEnd = Math.max(...mission.segments.map((s: any) => s.end))

    // Filter out missions that start beyond the actual horizon
    if (missionStart >= props.horizonHours) {
      return null
    }

    if (missionEnd <= currentStartHour.value || missionStart >= currentEndHour.value) {
      return null // Outside window
    }

    // Adjust segments relative to page start
    return {
      ...mission,
      segments: mission.segments.map((seg: any) => ({
        ...seg,
        start: Math.max(0, seg.start - currentStartHour.value),
        end: Math.min(displayHorizonHours.value, seg.end - currentStartHour.value)
      })).filter((seg: any) => seg.start < displayHorizonHours.value),
      crew: mission.crew ? {
        pilots: mission.crew.pilots?.map((p: any) => ({
          ...p,
          start: Math.max(0, p.start - currentStartHour.value),
          end: Math.min(displayHorizonHours.value, p.end - currentStartHour.value)
        })).filter((p: any) => p.start < displayHorizonHours.value) || [],
        sos: mission.crew.sos?.map((s: any) => ({
          ...s,
          start: Math.max(0, s.start - currentStartHour.value),
          end: Math.min(displayHorizonHours.value, s.end - currentStartHour.value)
        })).filter((s: any) => s.start < displayHorizonHours.value) || [],
        intel: mission.crew.intel?.map((i: any) => ({
          ...i,
          start: Math.max(0, i.start - currentStartHour.value),
          end: Math.min(displayHorizonHours.value, i.end - currentStartHour.value)
        })).filter((i: any) => i.start < displayHorizonHours.value) || []
      } : undefined
    }
  }).filter(Boolean)
})

// Shared time markers generation
const timeMarkers = computed(() => {
  const ticks = []
  const windowSize = displayHorizonHours.value
  const startOffset = currentStartHour.value

  // For horizons less than 48 hours, show hours instead of days
  if (windowSize < 48) {
    const step = windowSize <= 12 ? 1 : Math.ceil(windowSize / 12)
    for (let hour = 0; hour <= windowSize; hour += step) {
      ticks.push({
        value: hour,
        label: formatTimeLabel(startOffset + hour),
        id: `${startOffset + hour}` // Unique ID for key
      })
    }
  } else {
    // Show days for longer horizons
    const days = Math.ceil(windowSize / 24)
    const step = Math.max(1, Math.floor(days / 10)) // Show ~10 ticks
    for (let day = 0; day <= days; day += step) {
      const hourValue = day * 24
      if (hourValue <= windowSize) {
        ticks.push({
          value: hourValue,
          label: formatTimeLabel(startOffset + hourValue),
          id: `${startOffset + hourValue}` // Unique ID for key
        })
      }
    }
  }

  return ticks
})

// Filter availability timeline for current page
const filteredAvailabilityTimeline = computed(() => {
  if (!props.availabilityTimeline) return props.availabilityTimeline

  const filtered: any = { pilot: {}, so: {}, intel: {} }

  // Filter pilot timelines
  if (props.availabilityTimeline.pilot) {
    for (const [unit, timeline] of Object.entries(props.availabilityTimeline.pilot)) {
      if (timeline && Array.isArray(timeline)) {
        filtered.pilot[unit] = timeline
          .filter((point: any) => point.time >= currentStartHour.value && point.time <= currentEndHour.value)
          .map((point: any) => ({
            ...point,
            time: point.time - currentStartHour.value
          }))
      }
    }
  }

  // Filter SO timelines
  if (props.availabilityTimeline.so) {
    for (const [unit, timeline] of Object.entries(props.availabilityTimeline.so)) {
      if (timeline && Array.isArray(timeline)) {
        filtered.so[unit] = timeline
          .filter((point: any) => point.time >= currentStartHour.value && point.time <= currentEndHour.value)
          .map((point: any) => ({
            ...point,
            time: point.time - currentStartHour.value
          }))
      }
    }
  }

  // Filter Intel timelines
  if (props.availabilityTimeline.intel) {
    for (const [unit, timeline] of Object.entries(props.availabilityTimeline.intel)) {
      if (timeline && Array.isArray(timeline)) {
        filtered.intel[unit] = timeline
          .filter((point: any) => point.time >= currentStartHour.value && point.time <= currentEndHour.value)
          .map((point: any) => ({
            ...point,
            time: point.time - currentStartHour.value
          }))
      }
    }
  }

  return filtered
})

// Helper functions to get units from availability timeline
const getUnitsFromTimeline = () => {
  if (!props.availabilityTimeline?.pilot) return []
  const units = Object.keys(props.availabilityTimeline.pilot)
    .filter(u => u !== 'aggregate')
    .filter(u => {
      // Filter out units with 0% mission split
      if (u === 'VMU-1') return props.unitSplit.vmu1 > 0
      if (u === 'VMU-3') return props.unitSplit.vmu3 > 0
      return true // Keep other units if they exist
    })
    .sort()
  return units
}
</script>

<template>
  <div class="visualization-container">
    <!-- Compact Tab Navigation -->
    <div class="viz-tabs">
      <button :class="['viz-tab', { active: activeTab === 'flight' }]" @click="activeTab = 'flight'">
        Flight Timeline
      </button>
      <button :class="['viz-tab', { active: activeTab === 'personnel' }]" @click="activeTab = 'personnel'"
        :disabled="!rawTimeline">
        Personnel Timeline
      </button>
      <button :class="['viz-tab', { active: activeTab === 'availability' }]" @click="activeTab = 'availability'"
        :disabled="!availabilityTimeline">
        Personnel Availability
      </button>
    </div>

    <!-- Timeline Tab -->
    <div v-show="activeTab === 'flight'" class="viz-content">
      <FlightTimeline :timeline="filteredTimeline" :horizon-hours="displayHorizonHours" :expanded-units="expandedUnits"
        :time-markers="timeMarkers" :colors="colors" :show-pagination="true" :current-page="currentPage"
        :total-pages="totalPages" :current-start-hour="currentStartHour" :current-end-hour="currentEndHour"
        :page-window-hours="pageWindowHours" :window-options="windowOptions" :max-expanded-height="maxExpandedHeight"
        :height-options="maxHeightOptions" :format-time-label="formatTimeLabel"
        :actual-horizon-hours="props.horizonHours" :legend-items="flightLegendItems"
        :unit-split="unitSplit" :initial-resources="initialResources" @toggle-unit="toggleUnit"
        @prev-page="prevPage" @next-page="nextPage" @update-window-size="pageWindowHours = $event"
        @update-max-height="maxExpandedHeight = $event" />
    </div>

    <!-- Personnel Timeline Tab -->
    <div v-show="activeTab === 'personnel'" class="viz-content">
      <PersonnelTimeline ref="personnelTimelineRef" :timeline="filteredRawTimeline" :raw-timeline="rawTimeline"
        :horizon-hours="displayHorizonHours" :expanded-units="expandedUnits" :time-markers="timeMarkers"
        :colors="colors" :crew-type="selectedCrewType" :personnel-availability="personnelAvailability"
        :initial-resources="initialResources" :utilization="utilization" :show-pagination="true"
        :current-page="currentPage" :total-pages="totalPages" :current-start-hour="currentStartHour"
        :current-end-hour="currentEndHour" :page-window-hours="pageWindowHours" :window-options="windowOptions"
        :max-expanded-height="maxExpandedHeight" :height-options="maxHeightOptions" :format-time-label="formatTimeLabel"
        :actual-horizon-hours="props.horizonHours" :legend-items="personnelLegendItems"
        :selector-options="personnelSelectorOptions" :selector-value="selectedCrewType" :show-divider="true"
        @toggle-unit="toggleUnit" @prev-page="prevPage" @next-page="nextPage"
        @update-window-size="pageWindowHours = $event" @update-max-height="maxExpandedHeight = $event"
        @update-selector="selectedCrewType = $event as 'pilot' | 'so' | 'intel'">
        <template #legend>
          <div class="legend-divider"></div>
          <div class="legend-item">
            <span class="legend-summary">
              Total Used: <strong>{{ crewStats.totalUsed }} / {{ crewStats.totalAvailable }}</strong>
              Total Effective: <strong>{{ crewStats.totalEffective }}</strong>
            </span>
          </div>
        </template>
      </PersonnelTimeline>
    </div>

    <!-- Availability Tab -->
    <div v-show="activeTab === 'availability'" class="viz-content">
      <div v-if="availabilityTimeline">
        <div v-for="(unit, index) in getUnitsFromTimeline()" :key="unit" class="unit-chart-row">
          <PersonnelAvailability :pilot-timeline="filteredAvailabilityTimeline.pilot?.[unit] || null"
            :so-timeline="filteredAvailabilityTimeline.so?.[unit] || null"
            :intel-timeline="filteredAvailabilityTimeline.intel?.[unit] || null" :horizon-hours="displayHorizonHours"
            :unit-name="unit" :selected-mos="selectedAvailabilityMos" :expanded-units="expandedUnits"
            :time-markers="timeMarkers" :colors="colors" :show-pagination="index === 0" :current-page="currentPage"
            :total-pages="totalPages" :current-start-hour="currentStartHour" :current-end-hour="currentEndHour"
            :page-window-hours="pageWindowHours" :window-options="windowOptions"
            :max-expanded-height="maxExpandedHeight" :height-options="maxHeightOptions"
            :format-time-label="formatTimeLabel" :actual-horizon-hours="props.horizonHours"
            :legend-items="index === getUnitsFromTimeline().length - 1 ? availabilityLegendItems : undefined"
            :selector-options="index === getUnitsFromTimeline().length - 1 ? availabilitySelectorOptions : undefined"
            :selector-value="selectedAvailabilityMos" :show-divider="true"
            @update:selected-mos="selectedAvailabilityMos = $event" @toggle-unit="toggleUnit" @prev-page="prevPage"
            @next-page="nextPage" @update-window-size="pageWindowHours = $event"
            @update-max-height="maxExpandedHeight = $event"
            @update-selector="selectedAvailabilityMos = $event as '7318' | '7314' | '0231'" />
        </div>
      </div>
      <div v-else class="no-availability-data">
        <p>Run a simulation with personnel availability factors to see the availability timeline.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.visualization-container {
  background: var(--panel-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 16px;
  overflow: hidden;
}

.chart-wrapper-with-pagination {
  display: flex;
  flex-direction: column;
}

.viz-tabs {
  display: flex;
  border-bottom: 2px solid var(--border-color);
  background: rgba(0, 0, 0, 0.02);
}

.viz-tab {
  flex: 1;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-muted-color);
  transition: all 0.2s ease;
}

.viz-tab:hover:not(:disabled) {
  color: var(--text-color);
  background: rgba(59, 130, 246, 0.05);
}

.viz-tab.active {
  color: var(--accent-blue);
  border-bottom-color: var(--accent-blue);
  background: rgba(59, 130, 246, 0.08);
}

.viz-tab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.viz-content {
  padding: 0;
}

.unit-chart-row {
  display: block;
}

.no-availability-data {
  padding: 60px 20px;
  text-align: center;
  color: var(--text-muted-color);
  font-style: italic;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  margin: 16px;
  border-radius: 4px;
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

<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { ref, computed } from 'vue'
import ChartRowLayout from './ChartRowLayout.vue'

// Hover state for highlighting
const hoveredMissionNumber = ref<number | null>(null)
const hoveredDutyType = ref<string | null>(null)
let hoverTimeout: number | null = null
const HOVER_DELAY_MS = 300 // Delay before ghosting activates

interface CrewAssignment {
  id: number
  start: number
  end: number
  shift?: number
}

interface MissionData {
  type: string
  unit: string
  mission_type: string
  mission_number?: number
  demand_time: number
  finish_time: number
  segments: Array<{
    name: string
    start: number
    end: number
  }>
  crew?: {
    pilots: CrewAssignment[]
    sos: CrewAssignment[]
    intel: CrewAssignment[]
  }
  duty_type?: string
  duty_id?: string
  start?: number
  end?: number
  requires_pilot?: number
  requires_so?: number
  crew_type?: string
  crew_id?: number
}

interface Props {
  timeline?: MissionData[]
  rawTimeline?: MissionData[]
  horizonHours: number
  expandedUnits: Set<string>
  timeMarkers: { value: number; label: string }[]
  colors: Record<string, string>
  crewType: 'pilot' | 'so' | 'intel'
  maxExpandedHeight?: number
  heightOptions?: { label: string; height: number }[]
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

const props = withDefaults(defineProps<Props>(), {
  timeline: () => [],
  crewType: 'pilot',
  maxExpandedHeight: 270,
  personnelAvailability: () => ({}),
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

// Get unique units from timeline - only include units with missions (not just duties)
const units = computed(() => {
  const unitSet = new Set(
    props.timeline
      .filter(e => e.type === 'mission')
      .map(e => e.unit)
  )
  return unitSet.size > 0 ? Array.from(unitSet).sort() : []
})

// Get crew assignments per unit
function getCrewAssignmentsForUnit(unit: string) {
  const crewKey = props.crewType === 'pilot' ? 'pilots' : props.crewType === 'so' ? 'sos' : 'intel'
  const assignments: Array<{ crewId: number; start: number; end: number; missionType: string; missionNumber?: number; isDuty?: boolean; dutyType?: string; dutyId?: string; isCrewRest?: boolean; shift?: number }> = []

  for (const mission of props.timeline) {
    if (mission.unit === unit) {
      // Handle flight missions with crew assignments
      if (mission.type !== 'duty' && mission.type !== 'duty_recovery' && mission.crew && mission.crew[crewKey]) {
        for (const assignment of mission.crew[crewKey]) {
          assignments.push({
            crewId: assignment.id,
            start: assignment.start,
            end: assignment.end,
            missionType: mission.mission_type,
            missionNumber: mission.mission_number,
            isDuty: false,
            shift: assignment.shift
          })
        }
      }
      // Handle duty assignments with actual crew member information
      else if (mission.type === 'duty' && mission.duty_type && mission.crew && mission.crew[crewKey]) {
        for (const assignment of mission.crew[crewKey]) {
          assignments.push({
            crewId: assignment.id,
            start: assignment.start,
            end: assignment.end,
            missionType: mission.duty_type.toUpperCase(),
            isDuty: true,
            dutyType: mission.duty_type,
            dutyId: mission.duty_id,
            shift: assignment.shift
          })
        }
      }
      // Handle duty recovery periods
      else if (mission.type === 'duty_recovery' && mission.crew_type === props.crewType) {
        if (mission.crew_id !== undefined && mission.start !== undefined && mission.end !== undefined) {
          assignments.push({
            crewId: mission.crew_id,
            start: mission.start,
            end: mission.end,
            missionType: 'Duty Recovery',
            isCrewRest: true,
            shift: undefined
          })
        }
      }
    }
  }

  return assignments
}

// Get unique crew IDs for a unit (to determine how many rows to show)
function getCrewIdsForUnit(unit: string): number[] {
  const assignments = getCrewAssignmentsForUnit(unit)
  const idSet = new Set(assignments.map(a => a.crewId))
  return Array.from(idSet).sort((a, b) => a - b)
}

// Get assignments for a specific crew member
function getAssignmentsForCrew(unit: string, crewId: number) {
  const assignments = getCrewAssignmentsForUnit(unit)
  return assignments.filter(a => a.crewId === crewId)
}

// Calculate position and width percentages
function getAssignmentStyle(assignment: { start: number; end: number; missionNumber?: number; isDuty?: boolean; dutyType?: string; isCrewRest?: boolean }) {
  const left = (assignment.start / props.horizonHours) * 100
  const width = ((assignment.end - assignment.start) / props.horizonHours) * 100
  const color = getMissionColor(assignment.missionNumber, assignment.isDuty, assignment.dutyType, assignment.isCrewRest)

  return {
    left: `${left}%`,
    width: `${width}%`,
    background: color.gradient,
    borderColor: color.border
  }
}

// Generate distinct colors for each mission number
function getMissionColor(missionNumber?: number, isDuty?: boolean, dutyType?: string, isCrewRest?: boolean) {
  // Crew rest periods - don't set color, let CSS class handle it
  if (isCrewRest) {
    return {
      gradient: 'transparent',
      border: 'transparent'
    }
  }

  // Duty assignments get specific colors
  if (isDuty && dutyType) {
    const dutyColors: Record<string, { gradient: string; border: string }> = {
      'odo': {
        gradient: 'linear-gradient(to right, #b56f7e, #a45e6d)',
        border: 'rgba(181, 111, 126, 0.5)'
      },
      'sdo': {
        gradient: 'linear-gradient(to right, #c78f5f, #b67e4e)',
        border: 'rgba(199, 143, 95, 0.5)'
      },
      'sdnco': {
        gradient: 'linear-gradient(to right, #bfb06f, #ae9f5e)',
        border: 'rgba(191, 176, 111, 0.5)'
      }
    }
    return dutyColors[dutyType.toLowerCase()] || {
      gradient: 'linear-gradient(to right, #64748b, #475569)',
      border: 'rgba(100, 116, 139, 0.5)'
    }
  }

  if (missionNumber === undefined) {
    return {
      gradient: 'linear-gradient(to right, #3b82f6, #2563eb)',
      border: 'rgba(59, 130, 246, 0.5)'
    }
  }

  // Color palette for missions - using matte colors
  const colors = [
    { base: '#5b7a9f', dark: '#4a6280' }, // Matte Blue
    { base: '#6b9b7f', dark: '#5a8a6e' }, // Matte Green
    { base: '#c78f5f', dark: '#b67e4e' }, // Matte Orange
    { base: '#8b7ba6', dark: '#7a6a95' }, // Matte Purple
    { base: '#b57a94', dark: '#a46983' }, // Matte Pink
    { base: '#5fa0ad', dark: '#4e8f9c' }, // Matte Cyan
    { base: '#b56f7e', dark: '#a45e6d' }, // Matte Rose
    { base: '#96a76b', dark: '#85965a' }, // Matte Lime
    { base: '#9d85b7', dark: '#8c74a6' }, // Matte Violet
    { base: '#5b9d95', dark: '#4a8c84' }, // Matte Teal
    { base: '#c89770', dark: '#b7865f' }, // Matte Orange-red
    { base: '#bfb06f', dark: '#ae9f5e' }, // Matte Yellow
  ]

  const colorIndex = (missionNumber - 1) % colors.length
  const color = colors[colorIndex]

  if (!color) {
    return {
      gradient: 'linear-gradient(to right, #3b82f6, #2563eb)',
      border: 'rgba(59, 130, 246, 0.5)'
    }
  }

  return {
    gradient: `linear-gradient(to right, ${color.base}, ${color.dark})`,
    border: `${color.base}80` // 50% opacity
  }
}

// Format crew label
function getCrewLabel(crewId: number): string {
  const prefix = props.crewType === 'pilot' ? 'P' : props.crewType === 'so' ? 'SO' : 'IN'
  return `${prefix}${crewId}`
}

// Get daily crew rest hours from personnel availability
function getCrewRestHours(): number {
  const mosCode = props.crewType === 'pilot' ? '7318' : props.crewType === 'so' ? '7314' : '0231'
  return props.personnelAvailability?.[mosCode]?.daily_crew_rest_hours ?? 12
}

// Get work schedule configuration for the crew type
function getWorkSchedule() {
  const mosCode = props.crewType === 'pilot' ? '7318' : props.crewType === 'so' ? '7314' : '0231'
  const mosConfig = props.personnelAvailability?.[mosCode]
  return (mosConfig as any)?.work_schedule || {
    days_on: 365,
    days_off: 0,
    daily_start_hour: 0,
    shift_split_enabled: false,
    shift_split_percent: 50,
    stagger_days_off: 0
  }
}

// Calculate which shift a crew member is assigned to based on actual assignments from backend
function getCrewShiftAssignment(unit: string, crewId: number): number {
  const workSchedule = getWorkSchedule()
  if (!workSchedule.shift_split_enabled) return 1

  // Get any assignment for this crew member to find their actual shift
  const assignments = getCrewAssignmentsForUnit(unit)
  const crewAssignment = assignments.find(a => a.crewId === crewId)

  // If we have shift info from backend, use it
  if (crewAssignment && crewAssignment.shift !== undefined) {
    return crewAssignment.shift
  }

  // Fallback to calculation if no shift info available
  const totalCrewIds = getCrewIdsForUnit(unit)
  const splitPercent = workSchedule.shift_split_percent || 50
  const shift1Count = Math.round(totalCrewIds.length * (splitPercent / 100))
  return crewId < shift1Count ? 1 : 2
}

// Calculate coverage bands showing zero, single, or double coverage across shifts
// Also marks which periods this specific crew member is working
function getWorkScheduleBands(unit: string, crewId: number) {
  const workSchedule = getWorkSchedule()
  const crewRestHours = getCrewRestHours()
  const workingHours = Math.max(0, 24 - crewRestHours)

  const crewShiftAssignment = getCrewShiftAssignment(unit, crewId)

  const daysOn = workSchedule.days_on || 365
  const daysOff = workSchedule.days_off || 0
  const cycleDays = daysOn + daysOff
  const staggerDays = workSchedule.stagger_days_off || 0

  const shift1StartHour = workSchedule.daily_start_hour || 0
  const shift2StartHour = (shift1StartHour + 12) % 24

  // Calculate this crew member's shift start hour
  const thisCrewShiftStart = crewShiftAssignment === 1 ? shift1StartHour : shift2StartHour

  const bands: Array<{ start: number; end: number; type: 'working' | 'zero-coverage' | 'double-coverage' | 'days-off' | 'other-shift' }> = []

  // Generate bands for entire horizon
  let currentHour = 0
  while (currentHour < props.horizonHours) {
    // Apply stagger offset for this crew member
    // Subtract both stagger and daily start hour to align days off with start time
    const staggerHours = staggerDays * crewId * 24
    const adjustedHour = currentHour - staggerHours - shift1StartHour
    const cycleHours = cycleDays * 24
    const adjustedCycleHour = ((adjustedHour % cycleHours) + cycleHours) % cycleHours
    const daysOnHours = daysOn * 24
    const isDaysOn = adjustedCycleHour < daysOnHours

    if (!isDaysOn && daysOff > 0) {
      // Days off period - calculate exactly when it ends
      // Find hours until cycle resets (end of days-off period)
      const hoursUntilCycleEnd = cycleHours - adjustedCycleHour
      const daysOffEnd = Math.min(currentHour + hoursUntilCycleEnd, props.horizonHours)
      bands.push({ start: currentHour, end: daysOffEnd, type: 'days-off' })
      currentHour = daysOffEnd
      continue
    }

    // Days on - calculate coverage and this crew's working status
    const hourOfDay = currentHour % 24

    // Check if this crew member is working at this hour
    const thisCrewEndHour = (thisCrewShiftStart + workingHours) % 24
    let thisCrewWorking: boolean
    if (thisCrewEndHour > thisCrewShiftStart) {
      thisCrewWorking = hourOfDay >= thisCrewShiftStart && hourOfDay < thisCrewEndHour
    } else {
      thisCrewWorking = hourOfDay >= thisCrewShiftStart || hourOfDay < thisCrewEndHour
    }

    // Check if Shift 1 is working at this hour
    const shift1EndHour = (shift1StartHour + workingHours) % 24
    let shift1Working: boolean
    if (shift1EndHour > shift1StartHour) {
      shift1Working = hourOfDay >= shift1StartHour && hourOfDay < shift1EndHour
    } else {
      shift1Working = hourOfDay >= shift1StartHour || hourOfDay < shift1EndHour
    }

    // Check if Shift 2 is working at this hour (if shift split enabled)
    let shift2Working = false
    if (workSchedule.shift_split_enabled) {
      const shift2EndHour = (shift2StartHour + workingHours) % 24
      if (shift2EndHour > shift2StartHour) {
        shift2Working = hourOfDay >= shift2StartHour && hourOfDay < shift2EndHour
      } else {
        shift2Working = hourOfDay >= shift2StartHour || hourOfDay < shift2EndHour
      }
    }

    // Determine coverage type
    let type: 'working' | 'zero-coverage' | 'double-coverage' | 'other-shift'
    if (!thisCrewWorking) {
      // This crew is not working
      if (workSchedule.shift_split_enabled) {
        // Shift split enabled: distinguish between other shift working vs gap
        if (shift1Working || shift2Working) {
          type = 'other-shift'  // Other shift is working, but not this crew
        } else {
          type = 'zero-coverage'  // Nobody is working (coverage gap)
        }
      } else {
        // Single shift mode: non-working hours are crew rest (gray), not zero coverage
        type = 'other-shift'  // Crew rest period
      }
    } else {
      // This crew is working
      if (shift1Working && shift2Working) {
        type = 'double-coverage'
      } else {
        type = 'working'
      }
    }

    const nextHour = currentHour + 1

    // Merge consecutive hours of same type
    const lastBand = bands[bands.length - 1]
    if (bands.length > 0 && lastBand && lastBand.type === type && lastBand.end === currentHour) {
      lastBand.end = nextHour
    } else {
      bands.push({ start: currentHour, end: Math.min(nextHour, props.horizonHours), type })
    }

    currentHour = nextHour
  }

  return bands
}

// Calculate position and width for schedule bands
function getScheduleBandStyle(band: { start: number; end: number; type: string }) {
  const left = (band.start / props.horizonHours) * 100
  const width = ((band.end - band.start) / props.horizonHours) * 100

  return {
    left: `${left}%`,
    width: `${width}%`
  }
}

// Hover handlers
function handleAssignmentMouseEnter(assignment: { missionNumber?: number; isDuty?: boolean; dutyType?: string }) {
  // Clear any existing timeout
  if (hoverTimeout !== null) {
    clearTimeout(hoverTimeout)
  }

  // Set a timeout before activating the ghosting effect
  hoverTimeout = window.setTimeout(() => {
    if (assignment.isDuty && assignment.dutyType) {
      hoveredDutyType.value = assignment.dutyType
      hoveredMissionNumber.value = null
    } else if (assignment.missionNumber !== undefined) {
      hoveredMissionNumber.value = assignment.missionNumber
      hoveredDutyType.value = null
    }
    hoverTimeout = null
  }, HOVER_DELAY_MS)
}

function handleAssignmentMouseLeave() {
  // Clear the timeout if we leave before the delay completes
  if (hoverTimeout !== null) {
    clearTimeout(hoverTimeout)
    hoverTimeout = null
  }

  // Clear the hover state
  hoveredMissionNumber.value = null
  hoveredDutyType.value = null
}

// Check if an assignment should be ghosted (dimmed)
function isGhosted(assignment: { missionNumber?: number; isDuty?: boolean; dutyType?: string }): boolean {
  if (hoveredMissionNumber.value === null && hoveredDutyType.value === null) {
    return false // Nothing is hovered, show all
  }

  if (hoveredMissionNumber.value !== null) {
    // A mission is hovered - show only that mission number
    return assignment.missionNumber !== hoveredMissionNumber.value
  }

  if (hoveredDutyType.value !== null) {
    // A duty is hovered - show only that duty type
    return !assignment.isDuty || assignment.dutyType !== hoveredDutyType.value
  }

  return false
}

// Calculate statistics for the crew type across all units
const crewStats = computed(() => {
  const crewKey = props.crewType === 'pilot' ? 'pilots' : 'sos'
  const allCrewIds = new Set<number>()
  const crewWithFlights = new Set<number>()
  const dutyAssignments: Record<string, Set<number>> = {
    odo: new Set(),
    sdo: new Set(),
    sdnco: new Set()
  }

  // Use rawTimeline if available (for full stats), otherwise fall back to filtered timeline
  const timelineToUse = props.rawTimeline || props.timeline

  // Count total personnel and track assignments that start before horizon
  for (const mission of timelineToUse) {
    if (!mission.crew || !mission.crew[crewKey]) continue

    // For missions, check if they start before the horizon
    if (mission.type === 'mission' && mission.segments) {
      const missionStart = Math.min(...mission.segments.map((s: any) => s.start))
      if (props.actualHorizonHours && missionStart >= props.actualHorizonHours) {
        continue // Skip missions that start after horizon
      }
    }

    // For duties, check if they start before the horizon
    if (mission.type === 'duty' && mission.start !== undefined) {
      if (props.actualHorizonHours && mission.start >= props.actualHorizonHours) {
        continue // Skip duties that start after horizon
      }
    }

    for (const assignment of mission.crew[crewKey]) {
      // Check if this specific assignment starts before horizon
      if (props.actualHorizonHours && assignment.start >= props.actualHorizonHours) {
        continue
      }

      allCrewIds.add(assignment.id)

      // Track flight missions (non-duty)
      if (mission.type !== 'duty') {
        crewWithFlights.add(assignment.id)
      }

      // Track duty assignments by type
      if (mission.type === 'duty' && mission.duty_type) {
        const dutyType = mission.duty_type.toLowerCase()
        if (dutyAssignments[dutyType]) {
          dutyAssignments[dutyType].add(assignment.id)
        }
      }
    }
  }

  // Count total crew from initial resources (sum across all units)
  let totalCrew = 0
  let totalEffective = 0
  const staffingKey = props.crewType === 'pilot' ? 'pilot' : props.crewType === 'so' ? 'so' : 'intel'

  if (props.initialResources?.staffingByUnit) {
    // Use actual staffing data from initial resources
    for (const unit of units.value) {
      const staffing = props.initialResources.staffingByUnit[unit]
      if (staffing) {
        totalCrew += staffing[staffingKey] || 0
      }
    }
  } else {
    // Fallback: use max crew IDs found in timeline
    for (const unit of units.value) {
      const crewIds = getCrewIdsForUnit(unit)
      totalCrew = Math.max(totalCrew, crewIds.length)
    }
  }

  // Calculate effective crew from utilization data (after availability factors)
  if (props.utilization) {
    for (const unit of units.value) {
      const unitUtil = props.utilization[unit]
      if (unitUtil?.effective_crew) {
        totalEffective += unitUtil.effective_crew[staffingKey] || 0
      }
    }
  } else {
    // Fallback: assume effective = available if no utilization data
    totalEffective = totalCrew
  }

  return {
    totalUsed: allCrewIds.size,
    totalAvailable: totalCrew,
    totalEffective: totalEffective,
    flownMissions: crewWithFlights.size,
    odoCount: dutyAssignments['odo']?.size || 0,
    sdoCount: dutyAssignments['sdo']?.size || 0,
    sdncoCount: dutyAssignments['sdnco']?.size || 0
  }
})

// Expose stats for parent component
defineExpose({
  crewStats
})
</script>

<template>
  <div class="personnel-timeline-container">
    <div class="personnel-timeline-content">
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
            <div class="unit-personnel-timeline" :class="{ 'expanded': expandedUnits.has(unit) }"
              :style="expandedUnits.has(unit) ? { height: `${maxExpandedHeight}px` } : {}">
              <!-- Grid lines -->
              <div class="grid-lines">
                <div v-for="marker in timeMarkers" :key="marker.value" class="grid-line"
                  :style="{ left: `${(marker.value / horizonHours) * 100}%` }"></div>
              </div>

              <!-- Collapsed view: all assignments stacked -->
              <template v-if="!expandedUnits.has(unit)">
                <div v-for="(assignment, idx) in getCrewAssignmentsForUnit(unit)" :key="`assignment-${idx}`"
                  :class="['crew-assignment', { 'ghosted': isGhosted(assignment), 'duty-assignment': assignment.isDuty, 'crew-rest-assignment': assignment.isCrewRest }]"
                  :style="getAssignmentStyle(assignment)"
                  :title="`${getCrewLabel(assignment.crewId)}: ${assignment.start.toFixed(2)}h - ${assignment.end.toFixed(2)}h (${(assignment.end - assignment.start).toFixed(2)}h shift)`"
                  @mouseenter="handleAssignmentMouseEnter(assignment)" @mouseleave="handleAssignmentMouseLeave">
                  <span v-if="assignment.missionNumber" class="mission-number">{{ assignment.missionNumber }}</span>
                  <span v-else-if="assignment.isDuty" class="duty-label">
                    {{ assignment.dutyType?.toUpperCase() }}{{ assignment.dutyId ? ` ${assignment.dutyId}` : '' }}
                  </span>
                </div>
              </template>

              <!-- Expanded view: separate row per crew member -->
              <template v-else>
                <div v-for="(crewId, rowIdx) in getCrewIdsForUnit(unit)" :key="`crew-${crewId}`" class="crew-row"
                  :style="{ top: `${rowIdx * 28}px`, height: '24px' }">
                  <!-- Crew label -->
                  <div class="crew-label">
                    {{ getCrewLabel(crewId) }}
                  </div>

                  <!-- Work schedule bands (coverage indicators) -->
                  <div v-for="(band, bandIdx) in getWorkScheduleBands(unit, crewId)" :key="`band-${bandIdx}`"
                    :class="['schedule-band', `schedule-${band.type}`]" :style="getScheduleBandStyle(band)"
                    :title="`${band.type === 'working' ? 'Working (Single Coverage)' : band.type === 'zero-coverage' ? 'Zero Coverage (Gap)' : band.type === 'double-coverage' ? 'Working (Double Coverage)' : band.type === 'other-shift' ? 'Other Shift Working' : 'Days Off'}: ${band.start.toFixed(2)}h - ${band.end.toFixed(2)}h`">
                  </div>

                  <!-- Assignments for this crew member -->
                  <div v-for="(assignment, assignIdx) in getAssignmentsForCrew(unit, crewId)"
                    :key="`assign-${assignIdx}`"
                    :class="['crew-assignment', { 'duty-assignment': assignment.isDuty, 'ghosted': isGhosted(assignment), 'crew-rest-assignment': assignment.isCrewRest }]"
                    :style="getAssignmentStyle(assignment)"
                    :title="`${getCrewLabel(crewId)}: ${assignment.start.toFixed(2)}h - ${assignment.end.toFixed(2)}h (${(assignment.end - assignment.start).toFixed(2)}h shift) - ${assignment.missionType}${assignment.missionNumber ? ' - Mission #' + assignment.missionNumber : ''}${assignment.isDuty && assignment.dutyId ? ` - Duty #${assignment.dutyId}` : assignment.isDuty ? ' (Duty)' : ''}`"
                    @mouseenter="handleAssignmentMouseEnter(assignment)" @mouseleave="handleAssignmentMouseLeave">
                    <span v-if="assignment.missionNumber" class="mission-number">{{ assignment.missionNumber }}</span>
                    <span v-else-if="assignment.isDuty" class="duty-label">
                      {{ assignment.dutyType?.toUpperCase() }}{{ assignment.dutyId ? ` ${assignment.dutyId}` : '' }}
                    </span>
                  </div>
                </div>
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
.personnel-timeline-container {
  display: block;
}

.personnel-timeline-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.units-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.unit-personnel-timeline {
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

.crew-assignment {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border-radius: 2px;
  transition: opacity 0.2s, filter 0.2s;
  border: 1px solid;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.crew-assignment.ghosted {
  opacity: 0.15;
  filter: grayscale(0.5);
}

.crew-assignment:not(.ghosted):hover {
  opacity: 1;
  cursor: pointer;
  border-width: 2px;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.mission-number {
  font-size: 0.65rem;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  white-space: nowrap;
}

.duty-label {
  font-size: 0.6rem;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.duty-assignment {
  opacity: 0.85;
}

.crew-rest-assignment {
  background: repeating-linear-gradient(45deg,
      rgba(148, 163, 184, 0.15),
      rgba(148, 163, 184, 0.15) 4px,
      rgba(148, 163, 184, 0.05) 4px,
      rgba(148, 163, 184, 0.05) 8px) !important;
  border: 1px solid rgba(148, 163, 184, 0.3) !important;
  z-index: 2;
}

.crew-rest {
  position: absolute;
  top: 2px;
  bottom: 2px;
  background: repeating-linear-gradient(45deg,
      rgba(148, 163, 184, 0.3),
      rgba(148, 163, 184, 0.3) 4px,
      rgba(203, 213, 225, 0.3) 4px,
      rgba(203, 213, 225, 0.3) 8px);
  border-radius: 2px;
  border: 1px solid rgba(148, 163, 184, 0.5);
  z-index: 1;
}

.crew-rest:hover {
  opacity: 0.8;
  cursor: help;
  border-color: rgba(148, 163, 184, 0.8);
}

.crew-row {
  position: absolute;
  left: 0;
  right: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.crew-label {
  position: absolute;
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted-color);
  z-index: 3;
  background: rgba(255, 255, 255, 0.9);
  padding: 0 4px;
  border-radius: 2px;
}

.schedule-band {
  position: absolute;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

.schedule-working {
  background: rgba(34, 197, 94, 0.15);
  border-top: 1px solid rgba(34, 197, 94, 0.3);
  border-bottom: 1px solid rgba(34, 197, 94, 0.3);
}

.schedule-zero-coverage {
  background: rgba(239, 68, 68, 0.2);
  border-top: 1px solid rgba(239, 68, 68, 0.4);
  border-bottom: 1px solid rgba(239, 68, 68, 0.4);
}

.schedule-double-coverage {
  background: rgba(59, 130, 246, 0.2);
  border-top: 1px solid rgba(59, 130, 246, 0.4);
  border-bottom: 1px solid rgba(59, 130, 246, 0.4);
}

.schedule-other-shift {
  background: rgba(148, 163, 184, 0.1);
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.schedule-days-off {
  background: repeating-linear-gradient(45deg,
      rgba(239, 68, 68, 0.1),
      rgba(239, 68, 68, 0.1) 10px,
      rgba(239, 68, 68, 0.2) 10px,
      rgba(239, 68, 68, 0.2) 20px);
  border-top: 1px solid rgba(239, 68, 68, 0.4);
  border-bottom: 1px solid rgba(239, 68, 68, 0.4);
}
</style>

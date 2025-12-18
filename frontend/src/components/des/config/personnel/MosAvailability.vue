<script setup lang="ts">
import { computed, ref } from 'vue'
import UnitShiftSummary from './UnitShiftSummary.vue'

interface WorkSchedule {
  days_on: number
  days_off: number
  daily_start_hour: number
  shift_split_enabled: boolean
  shift_split_percent: number
  stagger_days_off: number
}

interface MosConfig {
  work_schedule: WorkSchedule
  leave_days_annual: number
  range_days_annual: number
  safety_standdown_days_quarterly: number
  medical_days_monthly: number
  training_days_monthly: number
  daily_crew_rest_hours: number
}

interface Props {
  mos: '7318' | '7314' | '0231'
  mosLabel: string
  config: MosConfig
  staffing?: {
    vmu1: number
    vmu3: number
  }
}

interface Emits {
  (e: 'update', field: string, value: any): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

function updateField(field: string, value: any) {
  emit('update', field, value)
}

function calculateUnavailabilityBreakdown(config: MosConfig) {
  const breakdown = {
    leave: config.leave_days_annual || 0,
    range: config.range_days_annual || 0,
    standdown: (config.safety_standdown_days_quarterly || 0) * 4,
    medical: (config.medical_days_monthly || 0) * 12,
    training: (config.training_days_monthly || 0) * 12
  }
  const total = Object.values(breakdown).reduce((sum, val) => sum + val, 0)
  return { breakdown, total }
}

function calculateAvailabilityPercent(config: MosConfig): number {
  const totalDaysInYear = 365
  const unavailableDays = calculateUnavailabilityBreakdown(config).total
  const availableDays = Math.max(0, totalDaysInYear - unavailableDays)
  return (availableDays / totalDaysInYear) * 100
}

function formatTime(hour: number): string {
  return `${hour.toString().padStart(2, '0')}00`
}

function calculateShiftEnd(startHour: number, duration: number): number {
  return (startHour + duration) % 24
}

function getSingleShiftInfo(totalPersonnel: number) {
  const startHour = props.config.work_schedule.daily_start_hour || 0
  const crewRestHours = props.config.daily_crew_rest_hours || 12
  const workingHours = Math.max(0, 24 - crewRestHours)
  const workingEnd = calculateShiftEnd(startHour, workingHours)
  const availabilityFactor = availabilityPercent.value / 100
  const effectivePersonnel = Math.floor(totalPersonnel * availabilityFactor)

  return {
    start: formatTime(startHour),
    end: formatTime(startHour),
    duration: 24,
    workingHours: workingHours,
    workingStart: formatTime(startHour),
    workingEnd: formatTime(workingEnd),
    crewRestHours: crewRestHours,
    crewRestStart: formatTime(workingEnd),
    crewRestEnd: formatTime(startHour),
    personnel: totalPersonnel,
    effectivePersonnel: effectivePersonnel
  }
}

function isTimeInRange(time: number, rangeStart: number, rangeEnd: number): boolean {
  if (rangeStart <= rangeEnd) {
    return time >= rangeStart && time < rangeEnd
  } else {
    // Range wraps around midnight
    return time >= rangeStart || time < rangeEnd
  }
}

function getShiftSummary(totalPersonnel: number) {
  if (!props.config.work_schedule.shift_split_enabled) {
    return null
  }

  const splitPercent = props.config.work_schedule.shift_split_percent || 50
  const shift1Start = props.config.work_schedule.daily_start_hour || 0
  const shift1Duration = 12
  const shift1End = calculateShiftEnd(shift1Start, shift1Duration)
  const shift2Start = shift1End
  const shift2Duration = 12
  const shift2End = calculateShiftEnd(shift2Start, shift2Duration)

  const crewRestHours = props.config.daily_crew_rest_hours || 12

  // Total working hours per day = 24 - crew rest hours
  const totalWorkingHours = 24 - crewRestHours

  // Each shift works the FULL working hours, not split
  const shift1WorkingHours = totalWorkingHours
  const shift2WorkingHours = totalWorkingHours

  // Each shift has the same crew rest hours
  const shift1CrewRest = crewRestHours
  const shift2CrewRest = crewRestHours

  // Working period starts at shift start and goes for the working hours
  const shift1WorkEnd = calculateShiftEnd(shift1Start, shift1WorkingHours)
  const shift2WorkEnd = calculateShiftEnd(shift2Start, shift2WorkingHours)

  // Rest starts when working ends
  const shift1RestStart = shift1WorkEnd
  const shift2RestStart = shift2WorkEnd

  // Rest ends when next shift working starts (24h cycle)
  const shift1RestEnd = shift1Start
  const shift2RestEnd = shift2Start

  const shift1Personnel = Math.round(totalPersonnel * (splitPercent / 100))
  const shift2Personnel = totalPersonnel - shift1Personnel

  const availabilityFactor = availabilityPercent.value / 100
  const totalEffective = Math.floor(totalPersonnel * availabilityFactor)
  const shift1Effective = Math.round(totalEffective * (splitPercent / 100))
  const shift2Effective = totalEffective - shift1Effective

  return {
    shift1: {
      start: formatTime(shift1Start),
      end: formatTime(shift1End),
      duration: shift1Duration,
      workingHours: shift1WorkingHours,
      workingStart: formatTime(shift1Start),
      workingEnd: formatTime(shift1WorkEnd),
      crewRestHours: shift1CrewRest,
      crewRestStart: formatTime(shift1RestStart),
      crewRestEnd: formatTime(shift1RestEnd),
      personnel: shift1Personnel,
      effectivePersonnel: shift1Effective
    },
    shift2: {
      start: formatTime(shift2Start),
      end: formatTime(shift2End),
      duration: shift2Duration,
      workingHours: shift2WorkingHours,
      workingStart: formatTime(shift2Start),
      workingEnd: formatTime(shift2WorkEnd),
      crewRestHours: shift2CrewRest,
      crewRestStart: formatTime(shift2RestStart),
      crewRestEnd: formatTime(shift2RestEnd),
      personnel: shift2Personnel,
      effectivePersonnel: shift2Effective
    }
  }
}

const breakdown = computed(() => calculateUnavailabilityBreakdown(props.config))
const availabilityPercent = computed(() => calculateAvailabilityPercent(props.config))

const annualExpanded = ref(false)
const monthlyExpanded = ref(false)
const quarterlyExpanded = ref(false)
</script>

<template>
  <div class="availability-params">
    <div class="param-section">
      <div class="param-section-title">Work Schedule</div>
      <div class="param-row">
        <div class="param-field">
          <label>Days On</label>
          <input type="number" :value="config.work_schedule.days_on" min="1"
            @input="updateField('days_on', parseInt(($event.target as HTMLInputElement).value) || 5)" />
        </div>
        <div class="param-field">
          <label>Days Off</label>
          <input type="number" :value="config.work_schedule.days_off" min="0"
            @input="updateField('days_off', parseInt(($event.target as HTMLInputElement).value) ?? 0)" />
        </div>
        <div class="param-field">
          <label>Stagger Days Off</label>
          <input type="number" :value="config.work_schedule.stagger_days_off || 0" min="0" max="10" step="0.25"
            @input="updateField('stagger_days_off', parseFloat(($event.target as HTMLInputElement).value) || 0)" />
          <span class="field-hint">0 = same days off for all, 1+ = offset by N days</span>
        </div>
        <div class="param-field">
          <label>Daily Start Time (hour)</label>
          <input type="number" :value="config.work_schedule.daily_start_hour || 0" min="0" max="23"
            @input="updateField('daily_start_hour', parseInt(($event.target as HTMLInputElement).value) || 0)" />
          <span class="field-hint">Hour of day (0-23, e.g., 8 = 0800)</span>
        </div>
        <div class="param-field">
          <label>Daily Crew Rest (hours) 7 - 23</label>
          <input type="number" :value="config.daily_crew_rest_hours || 12" min="7" max="23" step="1.0"
            @input="updateField('daily_crew_rest_hours', parseFloat(($event.target as HTMLInputElement).value) || 12)" />
          <span class="field-hint"></span>
        </div>
        <div v-if="config.work_schedule.shift_split_enabled" class="param-field">
          <label>First Shift Crew %</label>
          <input type="number" :value="config.work_schedule.shift_split_percent || 50" min="0" max="100"
            @input="updateField('shift_split_percent', parseInt(($event.target as HTMLInputElement).value) || 50)" />
          <span class="field-hint"></span>
        </div>
      </div>

      <!-- Visual Shift Timeline -->
      <div v-if="staffing" class="shift-timeline">
        <div class="timeline-controls">
          <div class="param-field">
            <label class="checkbox-label">
              <input type="checkbox" :checked="config.work_schedule.shift_split_enabled || false"
                @change="updateField('shift_split_enabled', ($event.target as HTMLInputElement).checked)" />
              <span>Enable Day/Night Shift Split</span>
            </label>
          </div>

        </div>
        <div class="timeline-header">
          <div class="timeline-legend">
            <div class="legend-item">
              <span class="legend-color working"></span>
              <span class="legend-label">Working</span>
            </div>
            <div class="legend-item">
              <span class="legend-color resting"></span>
              <span class="legend-label">Crew Rest</span>
            </div>
            <div v-if="config.work_schedule.shift_split_enabled" class="legend-item">
              <span class="legend-color double-coverage"></span>
              <span class="legend-label">Double Coverage</span>
            </div>
            <div v-if="config.work_schedule.shift_split_enabled" class="legend-item">
              <span class="legend-color gap"></span>
              <span class="legend-label">Zero Coverage</span>
            </div>
          </div>
        </div>
        <div class="timeline-container">
          <div class="timeline-hours">
            <span v-for="hour in 24" :key="hour" class="hour-mark">{{ (hour - 1).toString().padStart(2, '0') }}</span>
          </div>
          <div class="timeline-shifts">
            <template v-if="!config.work_schedule.shift_split_enabled">
              <!-- Single Shift Display -->
              <div class="shift-bar">
                <span class="shift-label">Single Shift</span>
                <div class="shift-segments">
                  <div v-for="hour in 24" :key="hour" class="hour-segment" :class="{
                    'working': isTimeInRange(hour - 1, config.work_schedule.daily_start_hour, calculateShiftEnd(config.work_schedule.daily_start_hour, 24 - (config.daily_crew_rest_hours || 12))),
                    'resting': !isTimeInRange(hour - 1, config.work_schedule.daily_start_hour, calculateShiftEnd(config.work_schedule.daily_start_hour, 24 - (config.daily_crew_rest_hours || 12)))
                  }"></div>
                </div>
              </div>
            </template>
            <template v-else>
              <!-- Split Shift Display -->
              <div class="shift-bar shift-1-bar">
                <span class="shift-label">Shift 1</span>
                <div class="shift-segments">
                  <div v-for="hour in 24" :key="hour" class="hour-segment" :class="{
                    'double-coverage': isTimeInRange(hour - 1, config.work_schedule.daily_start_hour, calculateShiftEnd(config.work_schedule.daily_start_hour, 24 - config.daily_crew_rest_hours)) && isTimeInRange(hour - 1, calculateShiftEnd(config.work_schedule.daily_start_hour, 12), calculateShiftEnd(calculateShiftEnd(config.work_schedule.daily_start_hour, 12), 24 - config.daily_crew_rest_hours)),
                    'working': isTimeInRange(hour - 1, config.work_schedule.daily_start_hour, calculateShiftEnd(config.work_schedule.daily_start_hour, 24 - config.daily_crew_rest_hours)) && !isTimeInRange(hour - 1, calculateShiftEnd(config.work_schedule.daily_start_hour, 12), calculateShiftEnd(calculateShiftEnd(config.work_schedule.daily_start_hour, 12), 24 - config.daily_crew_rest_hours)),
                    'resting': !isTimeInRange(hour - 1, config.work_schedule.daily_start_hour, calculateShiftEnd(config.work_schedule.daily_start_hour, 24 - config.daily_crew_rest_hours)) && isTimeInRange(hour - 1, calculateShiftEnd(config.work_schedule.daily_start_hour, 12), calculateShiftEnd(calculateShiftEnd(config.work_schedule.daily_start_hour, 12), 24 - config.daily_crew_rest_hours)),
                    'gap': !isTimeInRange(hour - 1, config.work_schedule.daily_start_hour, calculateShiftEnd(config.work_schedule.daily_start_hour, 24 - config.daily_crew_rest_hours)) && !isTimeInRange(hour - 1, calculateShiftEnd(config.work_schedule.daily_start_hour, 12), calculateShiftEnd(calculateShiftEnd(config.work_schedule.daily_start_hour, 12), 24 - config.daily_crew_rest_hours))
                  }"></div>
                </div>
              </div>
              <div class="shift-bar shift-2-bar">
                <span class="shift-label">Shift 2</span>
                <div class="shift-segments">
                  <div v-for="hour in 24" :key="hour" class="hour-segment" :class="{
                    'double-coverage': isTimeInRange(hour - 1, config.work_schedule.daily_start_hour, calculateShiftEnd(config.work_schedule.daily_start_hour, 24 - config.daily_crew_rest_hours)) && isTimeInRange(hour - 1, calculateShiftEnd(config.work_schedule.daily_start_hour, 12), calculateShiftEnd(calculateShiftEnd(config.work_schedule.daily_start_hour, 12), 24 - config.daily_crew_rest_hours)),
                    'working': isTimeInRange(hour - 1, calculateShiftEnd(config.work_schedule.daily_start_hour, 12), calculateShiftEnd(calculateShiftEnd(config.work_schedule.daily_start_hour, 12), 24 - config.daily_crew_rest_hours)) && !isTimeInRange(hour - 1, config.work_schedule.daily_start_hour, calculateShiftEnd(config.work_schedule.daily_start_hour, 24 - config.daily_crew_rest_hours)),
                    'resting': !isTimeInRange(hour - 1, calculateShiftEnd(config.work_schedule.daily_start_hour, 12), calculateShiftEnd(calculateShiftEnd(config.work_schedule.daily_start_hour, 12), 24 - config.daily_crew_rest_hours)) && isTimeInRange(hour - 1, config.work_schedule.daily_start_hour, calculateShiftEnd(config.work_schedule.daily_start_hour, 24 - config.daily_crew_rest_hours)),
                    'gap': !isTimeInRange(hour - 1, config.work_schedule.daily_start_hour, calculateShiftEnd(config.work_schedule.daily_start_hour, 24 - config.daily_crew_rest_hours)) && !isTimeInRange(hour - 1, calculateShiftEnd(config.work_schedule.daily_start_hour, 12), calculateShiftEnd(calculateShiftEnd(config.work_schedule.daily_start_hour, 12), 24 - config.daily_crew_rest_hours))
                  }"></div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

    </div>

    <div class="param-section accordion">
      <div class="param-section-title accordion-header" @click="annualExpanded = !annualExpanded">
        <span class="accordion-icon">{{ annualExpanded ? '▼' : '▶' }}</span>
        <span>Annual Commitments</span>
      </div>
      <div v-show="annualExpanded" class="accordion-content">
        <div class="param-row">
          <div class="param-field">
            <label>Leave Days (annual)</label>
            <input type="number" :value="config.leave_days_annual" min="0"
              @input="updateField('leave_days_annual', parseInt(($event.target as HTMLInputElement).value) || 0)" />
            <span class="field-hint">Total leave days per year</span>
          </div>

          <div class="param-field">
            <label>Range Days (annual)</label>
            <input type="number" :value="config.range_days_annual" min="0"
              @input="updateField('range_days_annual', parseInt(($event.target as HTMLInputElement).value) || 0)" />
            <span class="field-hint">Days required for range qualification</span>
          </div>
        </div>
      </div>
    </div>

    <div class="param-section accordion">
      <div class="param-section-title accordion-header" @click="quarterlyExpanded = !quarterlyExpanded">
        <span class="accordion-icon">{{ quarterlyExpanded ? '▼' : '▶' }}</span>
        <span>Quarterly Commitments</span>
      </div>
      <div v-show="quarterlyExpanded" class="accordion-content">
        <div class="param-row">
          <div class="param-field">
            <label>Safety Stand-down Days (per quarter)</label>
            <input type="number" :value="config.safety_standdown_days_quarterly" min="0"
              @input="updateField('safety_standdown_days_quarterly', parseInt(($event.target as HTMLInputElement).value) || 0)" />
            <span class="field-hint">HHQ mandated safety days</span>
          </div>
        </div>
      </div>
    </div>

    <div class="param-section accordion">
      <div class="param-section-title accordion-header" @click="monthlyExpanded = !monthlyExpanded">
        <span class="accordion-icon">{{ monthlyExpanded ? '▼' : '▶' }}</span>
        <span>Monthly Commitments</span>
      </div>
      <div v-show="monthlyExpanded" class="accordion-content">
        <div class="param-row">
          <div class="param-field">
            <label>Medical/Dental Days (per month)</label>
            <input type="number" :value="config.medical_days_monthly" min="0"
              @input="updateField('medical_days_monthly', parseInt(($event.target as HTMLInputElement).value) || 0)" />
            <span class="field-hint">Medical/dental appointments</span>
          </div>

          <div class="param-field">
            <label>PME/Training Days (per month)</label>
            <input type="number" :value="config.training_days_monthly" min="0"
              @input="updateField('training_days_monthly', parseInt(($event.target as HTMLInputElement).value) || 0)" />
            <span class="field-hint">Professional development & ground training</span>
          </div>
        </div>
      </div>
    </div>

    <div class="availability-summary">
      <div class="summary-title">Availability Summary - {{ mosLabel }}</div>
      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-label">Work Schedule:</span>
          <span class="stat-value">{{ config.work_schedule.days_on }} on / {{ config.work_schedule.days_off }}
            off</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Estimated Availability:</span>
          <span class="stat-value availability-highlight">{{ availabilityPercent.toFixed(1) }}%</span>
        </div>
      </div>

      <div class="availability-note">
        <strong>Note:</strong> Availability % is based solely on annual, quarterly, and monthly commitments (leave,
        range,
        standdown, medical, training). This percentage represents the fraction of calendar days personnel are available
        for
        duty. Work schedule (days on/off) and crew rest hours control <em>when</em> personnel can work during those
        available days, but don't reduce the availability percentage itself.
      </div>

      <!-- Shift Configuration Summary -->
      <div v-if="staffing" class="shift-summary-section">
        <UnitShiftSummary :shift-split-enabled="config.work_schedule.shift_split_enabled"
          :single-shift-info="getSingleShiftInfo(staffing.vmu1)" :split-shift-summary="getShiftSummary(staffing.vmu1)"
          :vmu1-personnel="staffing.vmu1" :vmu3-personnel="staffing.vmu3" />
      </div>

      <div class="breakdown-section">
        <div class="breakdown-title">Unavailable Days Breakdown (per year):</div>
        <div class="breakdown-grid">
          <div class="breakdown-item" v-if="breakdown.breakdown.leave > 0">
            <span class="breakdown-label">Leave:</span>
            <span class="breakdown-value">{{ breakdown.breakdown.leave.toFixed(1) }} days</span>
          </div>
          <div class="breakdown-item" v-if="breakdown.breakdown.range > 0">
            <span class="breakdown-label">Range:</span>
            <span class="breakdown-value">{{ breakdown.breakdown.range.toFixed(1) }} days</span>
          </div>
          <div class="breakdown-item" v-if="breakdown.breakdown.standdown > 0">
            <span class="breakdown-label">Standdown:</span>
            <span class="breakdown-value">{{ breakdown.breakdown.standdown.toFixed(1) }} days</span>
          </div>
          <div class="breakdown-item" v-if="breakdown.breakdown.medical > 0">
            <span class="breakdown-label">Medical:</span>
            <span class="breakdown-value">{{ breakdown.breakdown.medical.toFixed(1) }} days</span>
          </div>
          <div class="breakdown-item" v-if="breakdown.breakdown.training > 0">
            <span class="breakdown-label">Training:</span>
            <span class="breakdown-value">{{ breakdown.breakdown.training.toFixed(1) }} days</span>
          </div>
          <div class="breakdown-item breakdown-total-item">
            <span class="breakdown-label">Total:</span>
            <span class="breakdown-value breakdown-total-value">{{ breakdown.total.toFixed(1) }} days</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.availability-params {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.param-section {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
}

.param-section-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-color);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.accordion .param-section-title {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.accordion-header {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  padding: 8px;
  margin: -8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.accordion-header:hover {
  background: rgba(0, 0, 0, 0.05);
}

.accordion-icon {
  font-size: 0.7rem;
  color: var(--text-muted-color);
  transition: transform 0.2s;
}

.accordion-content {
  padding-top: 12px;
}

.param-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.param-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-field label {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-weight: 500;
}

.param-field input {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.85rem;
}

.param-field input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.field-hint {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-style: italic;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-muted-color);
  cursor: pointer;
  user-select: none;
  margin-top: 4px;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.checkbox-label span {
  flex: 1;
}

.availability-summary {
  border-radius: 6px;
  padding: 16px;
  margin-top: 8px;
}

.summary-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-color);
  margin-bottom: 12px;
}

.summary-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.stat-label {
  font-size: 0.85rem;
  color: var(--text-muted-color);
  font-weight: 500;
}

.stat-value {
  font-size: 0.9rem;
  color: var(--text-color);
  font-weight: 600;
  font-family: monospace;
}

.availability-highlight {
  color: var(--accent-blue);
  font-size: 1.1rem;
  font-weight: 700;
}

.availability-note {
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 4px;
  padding: 10px 12px;
  margin-top: 12px;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-muted-color);
}

.availability-note strong {
  color: var(--text-color);
  font-weight: 600;
}

.breakdown-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 2px solid rgba(59, 130, 246, 0.3);
}

.breakdown-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 10px;
}

.breakdown-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.breakdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  font-size: 0.8rem;
}

.breakdown-label {
  color: var(--text-muted-color);
  font-weight: 500;
}

.breakdown-value {
  color: var(--text-color);
  font-weight: 600;
  font-family: monospace;
}

.breakdown-total-item {
  background: rgba(59, 130, 246, 0.05);
  border: 2px solid rgba(59, 130, 246, 0.3);
}

.breakdown-total-item .breakdown-label {
  color: var(--text-color);
  font-weight: 700;
}

.breakdown-total-value {
  color: var(--accent-blue);
  font-size: 0.9rem;
  font-weight: 700;
}

.shift-summary-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 2px solid rgba(34, 197, 94, 0.3);
}

.shift-timeline {
  margin-top: 16px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.timeline-controls {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.timeline-controls .param-field {
  flex: 0 0 auto;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 12px;
}

.timeline-legend {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-color {
  width: 20px;
  height: 16px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.legend-color.working {
  background: #22c55e;
}

.legend-color.resting {
  background: #a4a4a4;
}

.legend-color.gap {
  background: #ef4444;
}

.legend-color.double-coverage {
  background: #3b82f6;
}

.legend-label {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-weight: 500;
}

.timeline-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-hours {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 1px;
  margin-left: 88px;
}

.hour-mark {
  font-size: 0.65rem;
  color: var(--text-muted-color);
  text-align: center;
  font-family: monospace;
}

.timeline-shifts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shift-bar {
  display: grid;
  grid-template-columns: 80px 1fr;
  align-items: center;
  gap: 8px;
}

.shift-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-color);
  text-align: right;
  padding-right: 8px;
}

.shift-segments {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 1px;
  background: var(--border-color);
  border: 1px solid var(--border-color);
  border-radius: 2px;
  overflow: hidden;
}

.hour-segment {
  height: 28px;
  transition: background 0.2s;
}

.hour-segment.working {
  background: #22c55e;
}

.hour-segment.resting {
  background: #a4a4a4;
}

.hour-segment.gap {
  background: #ef4444;
}

.hour-segment.double-coverage {
  background: #3b82f6;
}

.shift-warnings {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.warning-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
}

.warning-both-working {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #1e40af;
}

.warning-both-resting {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #991b1b;
}

.warning-icon {
  font-size: 1rem;
}

.warning-message {
  flex: 1;
}
</style>

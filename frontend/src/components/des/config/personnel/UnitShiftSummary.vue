<script setup lang="ts">
import ShiftDisplay from './ShiftDisplay.vue'

interface ShiftInfo {
  start: string
  end: string
  duration: number
  workingHours: number
  workingStart: string
  workingEnd: string
  crewRestHours: number
  crewRestStart: string
  crewRestEnd: string
  personnel: number
  effectivePersonnel?: number
}

interface ShiftSummary {
  shift1: ShiftInfo
  shift2: ShiftInfo
}

interface Props {
  shiftSplitEnabled: boolean
  singleShiftInfo?: ShiftInfo
  splitShiftSummary?: ShiftSummary | null
  vmu1Personnel: number
  vmu3Personnel: number
}

defineProps<Props>()
</script>

<template>
  <div class="unit-shift-group">

    <!-- Single 24-hour shift when split is disabled -->
    <div v-if="!shiftSplitEnabled && singleShiftInfo" class="shift-container single-shift-layout">
      <div class="shift-summary-item">
        <div class="shift-header">Shift Schedule</div>
        <div class="shift-detail">
          <span class="shift-label">Time:</span>
          <span class="shift-value">
            {{ singleShiftInfo.start }} - {{ singleShiftInfo.end }}
          </span>
        </div>
        <div class="shift-detail">
          <span class="shift-label">Working Hours:</span>
          <span class="shift-value">
            {{ singleShiftInfo.workingHours }}h
            ({{ singleShiftInfo.workingStart }} - {{ singleShiftInfo.workingEnd }})
          </span>
        </div>
        <div class="shift-detail">
          <span class="shift-label">Crew Rest:</span>
          <span class="shift-value">
            {{ singleShiftInfo.crewRestHours }}h
            ({{ singleShiftInfo.crewRestStart }} - {{ singleShiftInfo.crewRestEnd }})
          </span>
        </div>
      </div>

      <!-- Personnel counts stacked vertically -->
      <div class="personnel-summary-stacked">
        <div class="personnel-item">
          <span class="personnel-label">VMU-1 Count:</span>
          <span class="personnel-value">
            {{ vmu1Personnel }}
            <span v-if="singleShiftInfo.effectivePersonnel !== undefined" class="effective-count">
              ({{ Math.floor(vmu1Personnel * (singleShiftInfo.effectivePersonnel / singleShiftInfo.personnel)) }}
              effective)
            </span>
          </span>
        </div>
        <div class="personnel-item">
          <span class="personnel-label">VMU-3 Count:</span>
          <span class="personnel-value">
            {{ vmu3Personnel }}
            <span v-if="singleShiftInfo.effectivePersonnel !== undefined" class="effective-count">
              ({{ Math.floor(vmu3Personnel * (singleShiftInfo.effectivePersonnel / singleShiftInfo.personnel)) }}
              effective)
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- Split shifts when enabled -->
    <div v-else-if="shiftSplitEnabled && splitShiftSummary" class="shift-container">
      <div class="shift-summary-grid">
        <ShiftDisplay :shift-number="1" :shift-info="splitShiftSummary.shift1" />
        <ShiftDisplay :shift-number="2" :shift-info="splitShiftSummary.shift2" />
      </div>

      <!-- Personnel counts per shift for each unit -->
      <div class="personnel-summary-split">
        <div class="personnel-unit-section">
          <div class="personnel-unit-header">VMU-1 Count:</div>
          <div class="personnel-shift-items">
            <div class="personnel-shift-item">
              <span class="personnel-label">Shift 1:</span>
              <span class="personnel-value">
                {{ splitShiftSummary.shift1.personnel }}
                <span v-if="splitShiftSummary.shift1.effectivePersonnel !== undefined" class="effective-count">
                  ({{ splitShiftSummary.shift1.effectivePersonnel }} effective)
                </span>
              </span>
            </div>
            <div class="personnel-shift-item">
              <span class="personnel-label">Shift 2:</span>
              <span class="personnel-value">
                {{ splitShiftSummary.shift2.personnel }}
                <span v-if="splitShiftSummary.shift2.effectivePersonnel !== undefined" class="effective-count">
                  ({{ splitShiftSummary.shift2.effectivePersonnel }} effective)
                </span>
              </span>
            </div>
          </div>
        </div>
        <div class="personnel-unit-section">
          <div class="personnel-unit-header">VMU-3 Count:</div>
          <div class="personnel-shift-items">
            <div class="personnel-shift-item">
              <span class="personnel-label">Shift 1:</span>
              <span class="personnel-value">
                {{ Math.round(vmu3Personnel * (splitShiftSummary.shift1.personnel / vmu1Personnel)) }}
                <span v-if="splitShiftSummary.shift1.effectivePersonnel !== undefined" class="effective-count">
                  ({{ Math.round(vmu3Personnel * (splitShiftSummary.shift1.effectivePersonnel / vmu1Personnel)) }}
                  effective)
                </span>
              </span>
            </div>
            <div class="personnel-shift-item">
              <span class="personnel-label">Shift 2:</span>
              <span class="personnel-value">
                {{ vmu3Personnel - Math.round(vmu3Personnel * (splitShiftSummary.shift1.personnel / vmu1Personnel)) }}
                <span v-if="splitShiftSummary.shift2.effectivePersonnel !== undefined" class="effective-count">
                  ({{ Math.round(vmu3Personnel * (splitShiftSummary.shift2.effectivePersonnel / vmu1Personnel)) }}
                  effective)
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unit-shift-group {
  width: 100%;
}

.shift-container {
  width: 100%;
}

.single-shift-layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.single-shift-layout .shift-summary-item {
  flex: 1;
  margin-bottom: 0;
}

.personnel-summary-stacked {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
}

.personnel-summary-stacked .personnel-item {
  margin-bottom: 0;
}

.shift-summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.shift-summary-item {
  padding: 12px;
  background: rgba(34, 197, 94, 0.05);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 4px;
}

.shift-header {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-color);
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(34, 197, 94, 0.2);
}

.shift-detail {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 0.8rem;
}

.shift-label {
  color: var(--text-muted-color);
  font-weight: 500;
}

.shift-value {
  color: var(--text-color);
  font-weight: 600;
  font-family: monospace;
}

.personnel-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.personnel-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(34, 197, 94, 0.05);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 4px;
}

.personnel-label {
  font-size: 0.85rem;
  color: var(--text-muted-color);
  font-weight: 600;
}

.personnel-value {
  color: #16a34a;
  font-size: 1rem;
  font-weight: 700;
  font-family: monospace;
}

.personnel-summary-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.personnel-unit-section {
  background: rgba(34, 197, 94, 0.05);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 4px;
  padding: 8px 12px;
}

.personnel-unit-header {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-muted-color);
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(34, 197, 94, 0.2);
}

.personnel-shift-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.personnel-shift-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.personnel-shift-item .personnel-label {
  font-size: 0.8rem;
}

.personnel-shift-item .personnel-value {
  font-size: 0.9rem;
}

.effective-count {
  color: #059669;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: 4px;
}
</style>

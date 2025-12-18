<script setup lang="ts">
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

interface Props {
  shiftNumber: 1 | 2
  shiftInfo: ShiftInfo
}

defineProps<Props>()
</script>

<template>
  <div class="shift-summary-item">
    <div class="shift-header">Shift {{ shiftNumber }}</div>
    <div class="shift-detail">
      <span class="shift-label">Time:</span>
      <span class="shift-value">{{ shiftInfo.start }} - {{ shiftInfo.end }}</span>
    </div>
    <div class="shift-detail">
      <span class="shift-label">Working Hours:</span>
      <span class="shift-value">{{ shiftInfo.workingHours }}h ({{ shiftInfo.workingStart }} - {{ shiftInfo.workingEnd
      }})</span>
    </div>
    <div class="shift-detail">
      <span class="shift-label">Crew Rest:</span>
      <span class="shift-value">{{ shiftInfo.crewRestHours }}h ({{ shiftInfo.crewRestStart }} - {{ shiftInfo.crewRestEnd
      }})</span>
    </div>
  </div>
</template>

<style scoped>
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

.shift-personnel {
  color: #16a34a;
  font-size: 0.95rem;
  font-weight: 700;
}
</style>

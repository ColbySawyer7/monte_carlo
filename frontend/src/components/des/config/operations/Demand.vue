<script setup lang="ts">
// TODO: review this file for cleanup and optimization
interface DemandEntry {
  missionType: string
  type: 'poisson' | 'deterministic'
  ratePerHour?: number
  everyHours?: number
  startAtHours?: number
}

interface Props {
  modelValue: DemandEntry[]
  availableMissionTypes: string[]
}

interface Emits {
  (e: 'update:modelValue', value: DemandEntry[]): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

function addDemand() {
  const defaultMissionType = props.availableMissionTypes[0] || 'MIR'
  const newDemand: DemandEntry = {
    missionType: defaultMissionType,
    type: 'poisson',
    ratePerHour: 2.5
  }
  emit('update:modelValue', [...props.modelValue, newDemand])
}

function removeDemand(index: number) {
  const updated = [...props.modelValue]
  updated.splice(index, 1)
  emit('update:modelValue', updated)
}

function updateField(index: number, field: string, value: any) {
  const updated = [...props.modelValue]
  updated[index] = { ...updated[index], [field]: value } as DemandEntry
  emit('update:modelValue', updated)
}

function updateDemandType(index: number, type: string) {
  const updated = [...props.modelValue]
  const current = updated[index]
  if (!current) return

  if (type === 'poisson') {
    updated[index] = {
      missionType: current.missionType,
      type: 'poisson',
      ratePerHour: 2.5
    }
  } else {
    updated[index] = {
      missionType: current.missionType,
      type: 'deterministic',
      everyHours: 1,
      startAtHours: 0
    }
  }
  emit('update:modelValue', updated)
}
</script>

<template>
  <div class="demand">
    <div class="section-header">
      <div class="section-title">Demand</div>
      <button class="btn secondary small" @click="addDemand">Add demand</button>
    </div>

    <div class="demand-description">
      Demand describes how often new missions are requested.
      <br /><br />
      Poisson means random demand with an average <strong>RATE</strong> per hour; the exact spacing varies and each hour
      is independent (memoryless). The higher the rate, the more frequent the requests. The lower the rate, the more
      spread out the requests tend to be.
      <br /><br />
      Deterministic means a mission is requested every fixed <strong>INTERVAL</strong>
      (e.g., every 4 hours), optionally starting at a given time.
    </div>

    <table class="demand-table">
      <thead>
        <tr>
          <th>Mission Type</th>
          <th>Type</th>
          <th>Rate / Interval</th>
          <th>Start (hrs)</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(demand, index) in modelValue" :key="index">
          <td>
            <select :value="demand.missionType"
              @change="updateField(index, 'missionType', ($event.target as HTMLSelectElement).value)">
              <option v-for="missionType in availableMissionTypes" :key="missionType" :value="missionType">
                {{ missionType }}
              </option>
            </select>
          </td>
          <td>
            <select :value="demand.type" @change="updateDemandType(index, ($event.target as HTMLSelectElement).value)">
              <option value="poisson">poisson</option>
              <option value="deterministic">deterministic</option>
            </select>
          </td>
          <td>
            <input v-if="demand.type === 'poisson'" type="number" :value="demand.ratePerHour"
              @input="updateField(index, 'ratePerHour', parseFloat(($event.target as HTMLInputElement).value) || 0)"
              min="0" step="0.01" class="rate-input" />
            <input v-else type="number" :value="demand.everyHours"
              @input="updateField(index, 'everyHours', parseFloat(($event.target as HTMLInputElement).value) || 1)"
              min="0" step="0.01" class="rate-input" />
          </td>
          <td>
            <span v-if="demand.type === 'poisson'" class="not-applicable">—</span>
            <input v-else type="number" :value="demand.startAtHours"
              @input="updateField(index, 'startAtHours', parseFloat(($event.target as HTMLInputElement).value) || 0)"
              min="0" step="0.01" class="start-input" />
          </td>
          <td>
            <button class="btn danger small" @click="removeDemand(index)">Remove</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.demand {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-color);
}

.demand-description {
  font-size: 0.85rem;
  color: var(--text-muted-color);
  line-height: 1.4;
  margin-bottom: 12px;
  padding: 8px;
  background: rgba(59, 130, 246, 0.05);
  border-left: 2px solid var(--accent-blue);
  border-radius: 4px;
}

.demand-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.demand-table th,
.demand-table td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.demand-table th {
  font-weight: 600;
  color: var(--text-muted-color);
  background: rgba(0, 0, 0, 0.02);
}

.demand-table td {
  color: var(--text-color);
}

.demand-table select,
.demand-table input {
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.85rem;
}

.demand-table select:focus,
.demand-table input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.rate-input,
.start-input {
  width: 80px;
}

.not-applicable {
  color: var(--text-muted-color);
  font-style: italic;
}

.btn {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn.secondary {
  background: var(--panel-color);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.btn.secondary:hover {
  background: var(--border-color);
}

.btn.danger {
  background: var(--chart-red);
  color: white;
}

.btn.danger:hover {
  opacity: 0.9;
}

.btn.small {
  padding: 2px 8px;
  font-size: 0.8rem;
}
</style>

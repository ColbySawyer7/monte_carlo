<script setup lang="ts">
interface FlightTime {
  type: 'triangular' | 'deterministic'
  a?: number
  m?: number
  b?: number
  value?: number
}

interface MissionType {
  name: string
  priority: number
  pilotReq: number
  soReq: number
  requiredPayloads: string[]
  flightTime: FlightTime
}

interface Props {
  modelValue: MissionType[]
}

interface Emits {
  (e: 'update:modelValue', value: MissionType[]): void
  (e: 'mission-types-changed'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const payloadTypes = ['SkyTower II', 'EW Pod', 'SmartSensor', 'Extended Range Tank']

function addMissionType() {
  const newMissionType: MissionType = {
    name: 'NEW',
    priority: 1,
    pilotReq: 1,
    soReq: 1,
    requiredPayloads: [],
    flightTime: {
      type: 'triangular',
      a: 2,
      m: 3,
      b: 4
    }
  }
  emit('update:modelValue', [...props.modelValue, newMissionType])
  emit('mission-types-changed')
}

function removeMissionType(index: number) {
  const updated = [...props.modelValue]
  updated.splice(index, 1)
  emit('update:modelValue', updated)
  emit('mission-types-changed')
}

function updateField(index: number, field: keyof MissionType, value: any) {
  const updated = [...props.modelValue]
  updated[index] = { ...updated[index], [field]: value } as MissionType
  emit('update:modelValue', updated)
  if (field === 'name') {
    emit('mission-types-changed')
  }
}

function togglePayload(index: number, payload: string) {
  const updated = [...props.modelValue]
  const payloads = [...(updated[index]?.requiredPayloads || [])]
  const idx = payloads.indexOf(payload)

  if (idx >= 0) {
    payloads.splice(idx, 1)
  } else {
    payloads.push(payload)
  }

  updated[index] = { ...updated[index], requiredPayloads: payloads } as MissionType
  emit('update:modelValue', updated)
}

function updateFlightTimeType(index: number, type: string) {
  const updated = [...props.modelValue]
  const newFlightTime: FlightTime = type === 'triangular'
    ? { type: 'triangular', a: 2, m: 3, b: 4 }
    : { type: 'deterministic', value: 3 }

  updated[index] = { ...updated[index], flightTime: newFlightTime } as MissionType
  emit('update:modelValue', updated)
}

function updateFlightTimeField(index: number, field: string, value: number) {
  const updated = [...props.modelValue]
  updated[index] = {
    ...updated[index],
    flightTime: {
      ...updated[index]?.flightTime,
      [field]: value
    }
  } as MissionType
  emit('update:modelValue', updated)
}
</script>

<template>
  <div class="mission-types">
    <div class="section-header">
      <div class="section-title">Mission Types</div>
      <button class="btn secondary small" @click="addMissionType">Add mission type</button>
    </div>

    <div class="mission-types-grid">
      <div v-for="(missionType, index) in modelValue" :key="index" class="mission-type-card">
        <div class="card-header">
          <strong>{{ missionType.name || 'Mission' }}</strong>
          <button class="btn danger small" @click="removeMissionType(index)">Remove</button>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label>Name</label>
            <input type="text" :value="missionType.name"
              @input="updateField(index, 'name', ($event.target as HTMLInputElement).value)" />
          </div>

          <div class="form-field">
            <label>Priority</label>
            <input type="number" :value="missionType.priority"
              @input="updateField(index, 'priority', parseFloat(($event.target as HTMLInputElement).value) || 0)"
              min="0" step="1" />
          </div>

          <div class="form-field">
            <label>Pilot req</label>
            <input type="number" :value="missionType.pilotReq"
              @input="updateField(index, 'pilotReq', parseInt(($event.target as HTMLInputElement).value) || 0)" min="0"
              step="1" />
          </div>

          <div class="form-field">
            <label>SO req</label>
            <input type="number" :value="missionType.soReq"
              @input="updateField(index, 'soReq', parseInt(($event.target as HTMLInputElement).value) || 0)" min="0"
              step="1" />
          </div>
        </div>

        <div class="payload-section">
          <div class="subsection-label">Required Payloads</div>
          <div class="payload-checkboxes">
            <label v-for="payload in payloadTypes" :key="payload">
              <input type="checkbox" :checked="missionType.requiredPayloads.includes(payload)"
                @change="togglePayload(index, payload)" />
              <span>{{ payload }}</span>
            </label>
          </div>
        </div>

        <div class="flight-time-section">
          <div class="subsection-label">Flight Time</div>
          <div class="form-row">
            <div class="form-field">
              <label>Type</label>
              <select :value="missionType.flightTime.type"
                @change="updateFlightTimeType(index, ($event.target as HTMLSelectElement).value)">
                <option value="triangular">triangular</option>
                <option value="deterministic">deterministic</option>
              </select>
            </div>

            <div v-if="missionType.flightTime.type === 'triangular'" class="form-field">
              <label>a (hrs)</label>
              <input type="number" :value="missionType.flightTime.a"
                @input="updateFlightTimeField(index, 'a', parseFloat(($event.target as HTMLInputElement).value) || 0)"
                min="0" step="0.01" />
            </div>

            <div class="form-field">
              <label>{{ missionType.flightTime.type === 'triangular' ? 'm (hrs)' : 'value (hrs)' }}</label>
              <input type="number"
                :value="missionType.flightTime.type === 'triangular' ? missionType.flightTime.m : missionType.flightTime.value"
                @input="updateFlightTimeField(index, missionType.flightTime.type === 'triangular' ? 'm' : 'value', parseFloat(($event.target as HTMLInputElement).value) || 0)"
                min="0" step="0.01" />
            </div>

            <div v-if="missionType.flightTime.type === 'triangular'" class="form-field">
              <label>b (hrs)</label>
              <input type="number" :value="missionType.flightTime.b"
                @input="updateFlightTimeField(index, 'b', parseFloat(($event.target as HTMLInputElement).value) || 0)"
                min="0" step="0.01" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<style scoped>
.mission-types {
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

.mission-types-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 1200px) {
  .mission-types-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .mission-types-grid {
    grid-template-columns: 1fr;
  }
}

.mission-type-card {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.card-header strong {
  font-size: 0.95rem;
  color: var(--text-color);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field label {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-weight: 500;
}

.form-field input,
.form-field select {
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.85rem;
}

.form-field input:focus,
.form-field select:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.payload-section,
.flight-time-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.subsection-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted-color);
  margin-bottom: 8px;
}

.payload-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.payload-checkboxes label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--text-color);
  cursor: pointer;
}

.payload-checkboxes input[type="checkbox"] {
  cursor: pointer;
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

<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { computed, watch } from 'vue'

interface CrewRotation {
  enabled: boolean
  pilot_shifts: number[]
  so_shifts: number[]
  intel_shifts: number[]
  sequential?: boolean
}

interface ProcessTimes {
  preflight: number
  postflight: number
  turnaround: number
  hold_crew_during_process_times?: boolean
  mountTimes: {
    'SkyTower II': number
    'EW Pod': number
    'SmartSensor': number
    'Extended Range Tank': number
  }
}

type FlightTime =
  | { type: 'triangular'; a: number; m: number; b: number; transit_in?: number; transit_out?: number }
  | { type: 'deterministic'; value: number; transit_in?: number; transit_out?: number }

interface MissionType {
  name: string
  priority: number
  pilotReq: number
  soReq: number
  intelReq: number
  requiredPayloads: string[]
  flightTime: FlightTime
  crew_rotation?: CrewRotation
  transit_in?: number
  transit_out?: number
  crew_distribution?: 'concentrate' | 'rotate' | 'random'
}

interface Props {
  modelValue: MissionType[]
  staffingMode?: boolean
  processTimes?: ProcessTimes
}

interface Emits {
  (e: 'update:modelValue', value: MissionType[]): void
  (e: 'mission-types-changed'): void
  (e: 'validation-changed', hasErrors: boolean): void
}

const props = withDefaults(defineProps<Props>(), {
  staffingMode: false,
  processTimes: () => ({
    preflight: 0.75,
    postflight: 0.5,
    turnaround: 0.25,
    mountTimes: {
      'SkyTower II': 0.5,
      'EW Pod': 0.3,
      'SmartSensor': 0.3,
      'Extended Range Tank': 0.4
    }
  })
})
const emit = defineEmits<Emits>()

const payloadTypes = ['SkyTower II', 'EW Pod', 'SmartSensor', 'Extended Range Tank']

// Check if any mission type has invalid crew rotation shifts
const hasValidationErrors = computed(() => {
  return props.modelValue.some(missionType => {
    if (!missionType.crew_rotation?.enabled) return false

    const expectedTotal = getEstimatedFlightTime(missionType)

    // Check pilot shifts if there are multiple pilots
    if (missionType.pilotReq > 1) {
      const pilotShifts = missionType.crew_rotation.pilot_shifts || []
      if (!isShiftSumValid(pilotShifts, expectedTotal)) return true
    }

    // Check SO shifts if there are multiple SOs
    if (missionType.soReq > 1) {
      const soShifts = missionType.crew_rotation.so_shifts || []
      if (!isShiftSumValid(soShifts, expectedTotal)) return true
    }

    // Check Intel shifts if there are multiple Intel
    if (missionType.intelReq > 1) {
      const intelShifts = missionType.crew_rotation.intel_shifts || []
      if (!isShiftSumValid(intelShifts, expectedTotal)) return true
    }

    return false
  })
})

// Emit validation state changes
watch(hasValidationErrors, (hasErrors) => {
  emit('validation-changed', hasErrors)
}, { immediate: true })

function getEstimatedFlightTime(missionType: MissionType): number {
  let baseTime = 0
  if (missionType.flightTime.type === 'deterministic') {
    baseTime = missionType.flightTime.value
  } else {
    // For triangular, use the mode (m) as the estimated time
    baseTime = missionType.flightTime.m
  }

  // Add transit times
  const transitIn = missionType.flightTime.transit_in || 0
  const transitOut = missionType.flightTime.transit_out || 0

  // Check if crew is held during process times (default is true if not specified)
  const holdCrewDuringProcessTimes = props.processTimes?.hold_crew_during_process_times !== false

  if (holdCrewDuringProcessTimes) {
    // Crew is held for entire mission including all process times
    const preflight = props.processTimes?.preflight || 0
    const postflight = props.processTimes?.postflight || 0
    const turnaround = props.processTimes?.turnaround || 0

    // Calculate total mount time for all required payloads
    let mountTime = 0
    const payloadMap: Record<string, keyof ProcessTimes['mountTimes']> = {
      'SkyTower II': 'SkyTower II',
      'EW Pod': 'EW Pod',
      'SmartSensor': 'SmartSensor',
      'Extended Range Tank': 'Extended Range Tank'
    }

    for (const payload of missionType.requiredPayloads) {
      const key = payloadMap[payload]
      if (key && props.processTimes?.mountTimes[key]) {
        mountTime += props.processTimes.mountTimes[key]
      }
    }

    return preflight + mountTime + transitIn + baseTime + transitOut + postflight + turnaround
  } else {
    // Crew is only held during flight operations (transit in + flight + transit out)
    return transitIn + baseTime + transitOut
  }
}

function canEnableCrewRotation(missionType: MissionType): boolean {
  return missionType.pilotReq > 1 || missionType.soReq > 1 || missionType.intelReq > 1
}

function getShiftSum(shifts: number[]): number {
  return shifts.reduce((sum, shift) => sum + shift, 0)
}

function isShiftSumValid(shifts: number[], expectedTotal: number): boolean {
  const sum = getShiftSum(shifts)
  return Math.abs(sum - expectedTotal) < 0.01 // Allow small floating point errors
}

function addMissionType() {
  const newMissionType: MissionType = {
    name: 'NEW',
    priority: 1,
    pilotReq: 1,
    soReq: 1,
    intelReq: 0,
    requiredPayloads: [],
    flightTime: {
      type: 'triangular',
      a: 2,
      m: 3,
      b: 4
    },
    crew_rotation: {
      enabled: true,
      pilot_shifts: [4],
      so_shifts: [4],
      intel_shifts: [],
      sequential: true
    },
    crew_distribution: 'concentrate'
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
  const current = updated[index]
  updated[index] = { ...updated[index], [field]: value } as MissionType

  // When pilot or SO count changes and crew rotation is enabled, update the shifts
  if ((field === 'pilotReq' || field === 'soReq' || field === 'intelReq') && current?.crew_rotation?.enabled) {
    const newMissionType = updated[index]
    const flightTime = getEstimatedFlightTime(newMissionType)

    if (field === 'pilotReq') {
      const newPilotCount = value as number
      const currentShifts = current.crew_rotation.pilot_shifts || []

      if (newPilotCount > currentShifts.length) {
        // Add more pilots with equal split of remaining time
        const newShifts = [...currentShifts]
        const equalShift = flightTime / newPilotCount
        while (newShifts.length < newPilotCount) {
          newShifts.push(equalShift)
        }
        updated[index] = {
          ...newMissionType,
          crew_rotation: {
            ...newMissionType.crew_rotation!,
            pilot_shifts: newShifts
          }
        } as MissionType
      } else if (newPilotCount < currentShifts.length) {
        // Remove excess pilots
        updated[index] = {
          ...newMissionType,
          crew_rotation: {
            ...newMissionType.crew_rotation!,
            pilot_shifts: currentShifts.slice(0, newPilotCount)
          }
        } as MissionType
      }

      // Disable crew rotation if pilot count drops to 1 or less and SO is also 1 or less and intel is 1 or less
      if (newPilotCount <= 1 && newMissionType.soReq <= 1 && newMissionType.intelReq <= 1) {
        updated[index] = {
          ...updated[index],
          crew_rotation: {
            enabled: false,
            pilot_shifts: [],
            so_shifts: [],
            intel_shifts: []
          }
        } as MissionType
      }
    }

    if (field === 'soReq') {
      const newSoCount = value as number
      const currentShifts = current.crew_rotation.so_shifts || []

      if (newSoCount > currentShifts.length) {
        // Add more SOs with equal split
        const newShifts = [...currentShifts]
        const equalShift = flightTime / newSoCount
        while (newShifts.length < newSoCount) {
          newShifts.push(equalShift)
        }
        updated[index] = {
          ...newMissionType,
          crew_rotation: {
            ...newMissionType.crew_rotation!,
            so_shifts: newShifts
          }
        } as MissionType
      } else if (newSoCount < currentShifts.length) {
        // Remove excess SOs
        updated[index] = {
          ...newMissionType,
          crew_rotation: {
            ...newMissionType.crew_rotation!,
            so_shifts: currentShifts.slice(0, newSoCount)
          }
        } as MissionType
      }

      // Disable crew rotation if SO count drops to 1 or less and pilot is also 1 or less and intel is 1 or less
      if (newSoCount <= 1 && newMissionType.pilotReq <= 1 && newMissionType.intelReq <= 1) {
        updated[index] = {
          ...updated[index],
          crew_rotation: {
            enabled: false,
            pilot_shifts: [],
            so_shifts: [],
            intel_shifts: []
          }
        } as MissionType
      }
    }

    if (field === 'intelReq') {
      const newIntelCount = value as number
      const currentShifts = current.crew_rotation.intel_shifts || []

      if (newIntelCount > currentShifts.length) {
        // Add more intel with equal split
        const newShifts = [...currentShifts]
        const equalShift = flightTime / newIntelCount
        while (newShifts.length < newIntelCount) {
          newShifts.push(equalShift)
        }
        updated[index] = {
          ...newMissionType,
          crew_rotation: {
            ...newMissionType.crew_rotation!,
            intel_shifts: newShifts
          }
        } as MissionType
      } else if (newIntelCount < currentShifts.length) {
        // Remove excess intel
        updated[index] = {
          ...newMissionType,
          crew_rotation: {
            ...newMissionType.crew_rotation!,
            intel_shifts: currentShifts.slice(0, newIntelCount)
          }
        } as MissionType
      }

      // Disable crew rotation if intel count drops to 1 or less and pilot is also 1 or less and SO is 1 or less
      if (newIntelCount <= 1 && newMissionType.pilotReq <= 1 && newMissionType.soReq <= 1) {
        updated[index] = {
          ...updated[index],
          crew_rotation: {
            enabled: false,
            pilot_shifts: [],
            so_shifts: [],
            intel_shifts: []
          }
        } as MissionType
      }
    }
  }

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

function toggleCrewRotation(index: number) {
  const updated = [...props.modelValue]
  const current = updated[index]

  if (!current) return

  // Only allow enabling if there are multiple crew members
  if (!canEnableCrewRotation(current)) return

  if (current.crew_rotation?.enabled) {
    updated[index] = {
      ...current,
      crew_rotation: {
        enabled: false,
        pilot_shifts: [],
        so_shifts: [],
        intel_shifts: [],
        sequential: false
      }
    } as MissionType
  } else {
    // Initialize with equal split
    const flightTime = getEstimatedFlightTime(current)
    const pilotCount = current.pilotReq || 1
    const soCount = current.soReq || 1
    const intelCount = current.intelReq || 0

    updated[index] = {
      ...current,
      crew_rotation: {
        enabled: true,
        pilot_shifts: Array(pilotCount).fill(flightTime / pilotCount),
        so_shifts: Array(soCount).fill(flightTime / soCount),
        intel_shifts: intelCount > 0 ? Array(intelCount).fill(flightTime / intelCount) : [],
        sequential: true
      }
    } as MissionType
  }

  emit('update:modelValue', updated)
}

function equalSplitShifts(index: number, crewType: 'pilot' | 'so' | 'intel') {
  const updated = [...props.modelValue]
  const current = updated[index]

  if (!current?.crew_rotation) return

  const flightTime = getEstimatedFlightTime(current)
  const crewCount = crewType === 'pilot' ? current.pilotReq : crewType === 'so' ? current.soReq : current.intelReq
  const equalShift = flightTime / crewCount

  const shifts = Array(crewCount).fill(equalShift)

  const shiftsKey = crewType === 'pilot' ? 'pilot_shifts' : crewType === 'so' ? 'so_shifts' : 'intel_shifts'
  updated[index] = {
    ...current,
    crew_rotation: {
      ...current.crew_rotation,
      [shiftsKey]: shifts,
      sequential: true
    }
  } as MissionType

  emit('update:modelValue', updated)
}

function updateCrewShift(index: number, crewType: 'pilot' | 'so' | 'intel', crewIndex: number, value: number) {
  const updated = [...props.modelValue]
  const current = updated[index]

  if (!current?.crew_rotation) return

  const shiftsKey = crewType === 'pilot' ? 'pilot_shifts' : crewType === 'so' ? 'so_shifts' : 'intel_shifts'
  const shifts = [...(current.crew_rotation[shiftsKey] || [])]
  shifts[crewIndex] = value

  updated[index] = {
    ...current,
    crew_rotation: {
      ...current.crew_rotation,
      [shiftsKey]: shifts
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
          <input type="text" class="name-input" :value="missionType.name"
            @input="updateField(index, 'name', ($event.target as HTMLInputElement).value)" placeholder="Mission Name" />
          <button class="btn danger small" @click="removeMissionType(index)">Remove</button>
        </div>

        <div class="form-row">
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

          <div class="form-field">
            <label>Intel req</label>
            <input type="number" :value="missionType.intelReq"
              @input="updateField(index, 'intelReq', parseInt(($event.target as HTMLInputElement).value) || 0)" min="0"
              step="1" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-field full-width">
            <label>Crew Distribution <span class="field-hint">(how to select crew for missions)</span></label>
            <select :value="missionType.crew_distribution || 'concentrate'"
              @change="updateField(index, 'crew_distribution', ($event.target as HTMLSelectElement).value)">
              <option value="concentrate">Concentrate - Reuse experienced crew</option>
              <option value="rotate">Rotate - Cycle through all crew members</option>
              <option value="random">Random - Select crew randomly</option>
            </select>
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

          <!-- Transit Times -->
          <div class="form-row">
            <div class="form-field">
              <label>Transit In (hrs)</label>
              <input type="number" :value="missionType.flightTime.transit_in || 0"
                @input="updateFlightTimeField(index, 'transit_in', parseFloat(($event.target as HTMLInputElement).value) || 0)"
                min="0" step="0.01" />
            </div>

            <div class="form-field">
              <label>Transit Out (hrs)</label>
              <input type="number" :value="missionType.flightTime.transit_out || 0"
                @input="updateFlightTimeField(index, 'transit_out', parseFloat(($event.target as HTMLInputElement).value) || 0)"
                min="0" step="0.01" />
            </div>
          </div>
        </div>

        <!-- Crew Rotation Section (for staffing mode) -->
        <div v-if="staffingMode && canEnableCrewRotation(missionType)" class="crew-rotation-section">
          <div class="subsection-header">
            <label class="checkbox-label">
              <input type="checkbox" :checked="missionType.crew_rotation?.enabled || false"
                @change="toggleCrewRotation(index)" />
              <span class="subsection-label">Crew Shift Rotation</span>
            </label>
          </div>

          <div v-if="missionType.crew_rotation?.enabled" class="rotation-config">
            <div class="rotation-description">
              Define how crew members rotate during this mission. Each crew member's shift duration is shown below.
              <strong>Total shifts must equal total mission time ({{ getEstimatedFlightTime(missionType).toFixed(2) }}
                hrs).</strong>
            </div>

            <!-- Pilot Shifts -->
            <div v-if="missionType.pilotReq > 1" class="crew-type-section">
              <div class="crew-type-header">
                <span class="crew-type-label">Pilot Shifts</span>
                <button class="btn secondary tiny" @click="equalSplitShifts(index, 'pilot')">
                  Equal Split
                </button>
              </div>

              <div class="shift-controls">
                <div v-for="(shift, pilotIdx) in (missionType.crew_rotation?.pilot_shifts || [])" :key="pilotIdx"
                  class="shift-row">
                  <label class="shift-label">Pilot {{ pilotIdx + 1 }}</label>
                  <input type="range" :value="shift"
                    @input="updateCrewShift(index, 'pilot', pilotIdx, parseFloat(($event.target as HTMLInputElement).value))"
                    :min="0" :max="getEstimatedFlightTime(missionType)" step="0.1" class="shift-slider" />
                  <input type="number" :value="shift.toFixed(2)"
                    @input="updateCrewShift(index, 'pilot', pilotIdx, parseFloat(($event.target as HTMLInputElement).value) || 0)"
                    min="0" :max="getEstimatedFlightTime(missionType)" step="0.1" class="shift-number" />
                  <span class="shift-unit">hrs</span>
                </div>
              </div>

              <div class="shift-validation"
                :class="{ valid: isShiftSumValid(missionType.crew_rotation?.pilot_shifts || [], getEstimatedFlightTime(missionType)), invalid: !isShiftSumValid(missionType.crew_rotation?.pilot_shifts || [], getEstimatedFlightTime(missionType)) }">
                Total: {{ getShiftSum(missionType.crew_rotation?.pilot_shifts || []).toFixed(2) }} hrs
                <span
                  v-if="!isShiftSumValid(missionType.crew_rotation?.pilot_shifts || [], getEstimatedFlightTime(missionType))">
                  (Expected: {{ getEstimatedFlightTime(missionType).toFixed(2) }} hrs)
                </span>
              </div>
            </div>

            <!-- SO Shifts -->
            <div v-if="missionType.soReq > 1" class="crew-type-section">
              <div class="crew-type-header">
                <span class="crew-type-label">SO Shifts</span>
                <button class="btn secondary tiny" @click="equalSplitShifts(index, 'so')">
                  Equal Split
                </button>
              </div>

              <div class="shift-controls">
                <div v-for="(shift, soIdx) in (missionType.crew_rotation?.so_shifts || [])" :key="soIdx"
                  class="shift-row">
                  <label class="shift-label">SO {{ soIdx + 1 }}</label>
                  <input type="range" :value="shift"
                    @input="updateCrewShift(index, 'so', soIdx, parseFloat(($event.target as HTMLInputElement).value))"
                    :min="0" :max="getEstimatedFlightTime(missionType)" step="0.1" class="shift-slider" />
                  <input type="number" :value="shift.toFixed(2)"
                    @input="updateCrewShift(index, 'so', soIdx, parseFloat(($event.target as HTMLInputElement).value) || 0)"
                    min="0" :max="getEstimatedFlightTime(missionType)" step="0.1" class="shift-number" />
                  <span class="shift-unit">hrs</span>
                </div>
              </div>

              <div class="shift-validation"
                :class="{ valid: isShiftSumValid(missionType.crew_rotation?.so_shifts || [], getEstimatedFlightTime(missionType)), invalid: !isShiftSumValid(missionType.crew_rotation?.so_shifts || [], getEstimatedFlightTime(missionType)) }">
                Total: {{ getShiftSum(missionType.crew_rotation?.so_shifts || []).toFixed(2) }} hrs
                <span
                  v-if="!isShiftSumValid(missionType.crew_rotation?.so_shifts || [], getEstimatedFlightTime(missionType))">
                  (Expected: {{ getEstimatedFlightTime(missionType).toFixed(2) }} hrs)
                </span>
              </div>
            </div>

            <!-- Intel Shifts -->
            <div v-if="missionType.intelReq > 1" class="crew-type-section">
              <div class="crew-type-header">
                <span class="crew-type-label">Intel Shifts</span>
                <button class="btn secondary tiny" @click="equalSplitShifts(index, 'intel')">
                  Equal Split
                </button>
              </div>

              <div class="shift-controls">
                <div v-for="(shift, intelIdx) in (missionType.crew_rotation?.intel_shifts || [])" :key="intelIdx"
                  class="shift-row">
                  <label class="shift-label">Intel {{ intelIdx + 1 }}</label>
                  <input type="range" :value="shift"
                    @input="updateCrewShift(index, 'intel', intelIdx, parseFloat(($event.target as HTMLInputElement).value))"
                    :min="0" :max="getEstimatedFlightTime(missionType)" step="0.1" class="shift-slider" />
                  <input type="number" :value="shift.toFixed(2)"
                    @input="updateCrewShift(index, 'intel', intelIdx, parseFloat(($event.target as HTMLInputElement).value) || 0)"
                    min="0" :max="getEstimatedFlightTime(missionType)" step="0.1" class="shift-number" />
                  <span class="shift-unit">hrs</span>
                </div>
              </div>

              <div class="shift-validation"
                :class="{ valid: isShiftSumValid(missionType.crew_rotation?.intel_shifts || [], getEstimatedFlightTime(missionType)), invalid: !isShiftSumValid(missionType.crew_rotation?.intel_shifts || [], getEstimatedFlightTime(missionType)) }">
                Total: {{ getShiftSum(missionType.crew_rotation?.intel_shifts || []).toFixed(2) }} hrs
                <span
                  v-if="!isShiftSumValid(missionType.crew_rotation?.intel_shifts || [], getEstimatedFlightTime(missionType))">
                  (Expected: {{ getEstimatedFlightTime(missionType).toFixed(2) }} hrs)
                </span>
              </div>
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
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
  max-width: 100%;
}

.mission-type-card {
  flex: 0 0 350px;
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
  gap: 12px;
}

.card-header .name-input {
  flex: 1;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 8px;
  transition: all 0.2s;
}

.card-header .name-input:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: var(--border-color);
}

.card-header .name-input:focus {
  outline: none;
  background: var(--bg-color);
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(75px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field.full-width {
  grid-column: 1 / -1;
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
.flight-time-section,
.crew-rotation-section {
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

.subsection-header {
  margin-bottom: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  cursor: pointer;
}

.rotation-config {
  margin-top: 8px;
  padding: 12px;
  background: rgba(59, 130, 246, 0.05);
  border-left: 2px solid var(--accent-blue);
  border-radius: 4px;
}

.rotation-description {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  margin-bottom: 16px;
  line-height: 1.4;
}

.crew-type-section {
  margin-bottom: 16px;
}

.crew-type-section:last-child {
  margin-bottom: 0;
}

.crew-type-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.crew-type-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
}

.shift-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 8px;
}

.shift-row {
  display: grid;
  grid-template-columns: 70px 1fr 70px 30px;
  gap: 8px;
  align-items: center;
}

.shift-label {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-weight: 500;
}

.shift-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border-color);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.shift-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent-blue);
  cursor: pointer;
  transition: all 0.2s;
}

.shift-slider::-webkit-slider-thumb:hover {
  background: #2563eb;
  transform: scale(1.1);
}

.shift-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent-blue);
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.shift-slider::-moz-range-thumb:hover {
  background: #2563eb;
  transform: scale(1.1);
}

.shift-number {
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.8rem;
  text-align: right;
}

.shift-unit {
  font-size: 0.75rem;
  color: var(--text-muted-color);
}

.shift-validation {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 6px 8px;
  border-radius: 4px;
  margin-top: 8px;
}

.shift-validation.valid {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.shift-validation.invalid {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.field-hint {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-style: italic;
  margin-top: 2px;
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

.btn.tiny {
  padding: 2px 6px;
  font-size: 0.75rem;
}
</style>

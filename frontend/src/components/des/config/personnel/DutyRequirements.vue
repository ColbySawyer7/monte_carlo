<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { computed } from 'vue'
import Duty from './Duty.vue'

interface DutyConfig {
  enabled: boolean
  shifts_per_day: number
  hours_per_shift: number
  start_hour: number
  requires_pilot: number
  requires_so: number
  requires_intel: number
  duty_recovery_hours?: number
  respect_work_schedule?: boolean
}

interface DutyLookaheadConfig {
  enabled: boolean
  hours: number
}

interface DutyRequirements {
  odo: DutyConfig
  sdo: DutyConfig
  sdnco: DutyConfig
  lookahead?: DutyLookaheadConfig
}

interface Props {
  modelValue: DutyRequirements
}

interface Emits {
  (e: 'update:modelValue', value: DutyRequirements): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

function updateDuty(dutyType: 'odo' | 'sdo' | 'sdnco', value: DutyConfig) {
  emit('update:modelValue', {
    ...props.modelValue,
    [dutyType]: value
  })
}

function updateLookahead(field: 'enabled' | 'hours', value: boolean | number) {
  const currentLookahead = props.modelValue.lookahead || { enabled: true, hours: 72 }
  emit('update:modelValue', {
    ...props.modelValue,
    lookahead: {
      ...currentLookahead,
      [field]: value
    }
  })
}

// Reactive computed property for lookahead
const lookahead = computed(() => props.modelValue.lookahead || { enabled: true, hours: 72 })
</script>

<template>
  <div class="duty-requirements">

    <div class="duty-description">
      Define continuous duty assignments that run concurrently with flight operations. These duties require
      dedicated personnel and will compete with flight operations for available crew.
    </div>

    <!-- Duties Grid -->
    <div class="duties-grid">
      <!-- ODO Duty -->
      <Duty :model-value="modelValue.odo" @update:model-value="updateDuty('odo', $event)" duty-name="ODO"
        :show-recovery="true" />

      <!-- SDO Duty -->
      <Duty :model-value="modelValue.sdo" @update:model-value="updateDuty('sdo', $event)" duty-name="SDO"
        :show-recovery="true" />

      <!-- SDNCO Duty -->
      <Duty :model-value="modelValue.sdnco" @update:model-value="updateDuty('sdnco', $event)" duty-name="SDNCO"
        :show-recovery="true" />
    </div>

    <!-- Duty Lookahead Configuration -->
    <div class="lookahead-section">
      <div class="lookahead-header">
        <label class="checkbox-label">
          <input type="checkbox" :checked="lookahead.enabled"
            @change="updateLookahead('enabled', ($event.target as HTMLInputElement).checked)" />
          <span class="lookahead-title">Enable Duty Lookahead</span>
        </label>
      </div>

      <div class="lookahead-config">
        <div class="param-field">
          <label>Lookahead Window (hours)</label>
          <input type="number" :value="lookahead.hours" min="0" max="720" step="1"
            @change="updateLookahead('hours', parseFloat(($event.target as HTMLInputElement).value) || 72)" />
        </div>

        <div class="lookahead-explanation">
          <div class="explanation-title">🔍 How Duty Lookahead Works</div>
          <div class="explanation-content">
            <p>
              <strong>Enabled:</strong> Before accepting a mission, the simulator looks ahead <strong>{{ lookahead.hours
              }}
                hours</strong> into the future to identify upcoming duty shifts. It reserves personnel from eligible MOS
              pools
              to ensure those duties can be filled, preventing missions from leaving insufficient personnel for
              critical duty assignments.
            </p>
            <ul>
              <li><strong>Conservative approach:</strong> For each duty that can be filled by multiple MOSs (e.g.,
                Pilot OR Sensor Operator OR Intel), the system reserves 1 person from <em>each</em> eligible pool</li>
              <li><strong>Mission rejection:</strong> If accepting a mission would violate reserved personnel counts,
                the mission is rejected even if personnel appear "available"</li>
              <li><strong>ODO exclusion:</strong> ODO duty is excluded from lookahead since it dynamically aligns
                with actual mission operations</li>
            </ul>
            <p class="example">
              <strong>Example:</strong> At t=100h with {{ lookahead.hours }}h lookahead, if 3 upcoming duty shifts
              each allow Pilot/SO/Intel, the system reserves 3 Pilots + 3 SOs + 3 Intel. A mission needing 8 pilots
              will be rejected if only 10 pilots are available (7 available after 3 reserved).
            </p>
          </div>
        </div>

        <div class="lookahead-explanation disabled-mode">
          <div class="explanation-title">⚠️ When Disabled</div>
          <div class="explanation-content">
            <p>
              The simulator will <strong>not reserve personnel</strong> for upcoming duties. Missions are accepted based
              purely on immediate crew availability, which may result in:
            </p>
            <ul>
              <li>Accepted missions consuming all available crew</li>
              <li>Subsequent duty shifts unable to find personnel</li>
              <li>More optimistic mission acceptance but potential duty coverage gaps</li>
            </ul>
            <p class="warning">
              <strong>⚠️ Use with caution:</strong> Disabling lookahead may overcommit resources and leave critical
              duties unstaffed.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.duty-requirements {
  margin-bottom: 16px;
}

.duty-description {
  font-size: 0.85rem;
  color: var(--text-muted-color);
  line-height: 1.4;
  margin-bottom: 16px;
  padding: 8px;
  background: rgba(59, 130, 246, 0.05);
  border-left: 2px solid var(--accent-blue);
  border-radius: 4px;
}

.lookahead-section {
  margin-top: 20px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.lookahead-header {
  margin-bottom: 12px;
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

.lookahead-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-color);
}

.lookahead-config {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.param-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 300px;
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
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 0.85rem;
}

.param-field input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.lookahead-explanation {
  padding: 12px;
  background: rgba(59, 130, 246, 0.05);
  border-left: 3px solid var(--accent-blue);
  border-radius: 4px;
}

.lookahead-explanation.disabled-mode {
  background: rgba(245, 158, 11, 0.05);
  border-left-color: rgb(245, 158, 11);
  margin-top: 8px;
}

.explanation-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 8px;
}

.explanation-content {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  line-height: 1.5;
}

.explanation-content p {
  margin: 0 0 8px 0;
}

.explanation-content ul {
  margin: 8px 0;
  padding-left: 20px;
}

.explanation-content li {
  margin-bottom: 4px;
}

.explanation-content strong {
  color: var(--text-color);
}

.example {
  padding: 8px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
  font-style: italic;
  margin-top: 8px !important;
}

.warning {
  padding: 8px;
  background: rgba(239, 68, 68, 0.05);
  border-left: 2px solid rgb(239, 68, 68);
  border-radius: 4px;
  margin-top: 8px !important;
}

.duties-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 1024px) {
  .duties-grid {
    grid-template-columns: 1fr;
  }
}
</style>

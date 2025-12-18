<script setup lang="ts">
// TODO: review this file for cleanup and optimization
import { ref, computed, watch } from 'vue'

const STORAGE_KEY = 'desResultsAnalysisActiveTab'

const activeTab = ref<'overview' | 'efficiency' | 'mission-performance' | 'crew-performance'>(
  (localStorage.getItem(STORAGE_KEY) as any) || 'overview'
)

// Save active tab to localStorage whenever it changes
watch(activeTab, (newTab) => {
  localStorage.setItem(STORAGE_KEY, newTab)
})

interface SimResults {
  horizon_hours?: number
  missions: {
    requested: number
    started: number
    completed: number
    rejected: number
  }
  rejections: {
    aircraft: number
    pilot: number
    so: number
    payload: number
  }
  utilization: Record<string, {
    aircraft: number
    pilot: number
    so: number
    availability_factors?: {
      pilot: number
      so: number
    }
    initial_crew?: {
      pilot: number
      so: number
    }
    effective_crew?: {
      pilot: number
      so: number
    }
    peak_concurrent?: {
      aircraft: number
      pilot: number
      so: number
    }
  }>
  by_type?: Record<string, {
    requested: number
    started: number
    completed: number
    rejected: number
  }>
  timeline?: any[]
}

interface Props {
  results: SimResults
}

const props = defineProps<Props>()

// Filter out units with zero utilization across all resources
const activeUnits = computed(() => {
  if (!props.results?.utilization) return {}

  const filtered: Record<string, any> = {}
  const threshold = 0.001 // 0.1% threshold to filter out negligible utilization

  for (const [unit, util] of Object.entries(props.results.utilization)) {
    // Include unit if any resource has utilization above threshold
    if (util.aircraft > threshold || util.pilot > threshold || util.so > threshold) {
      filtered[unit] = util
    }
  }
  return filtered
})

function formatPercent(value: number): string {
  return (value * 100).toFixed(0) + '%'
}

// Calculate rejection rate
const rejectionRate = computed(() => {
  if (!props.results) return 0
  const total = props.results.missions.requested
  return total > 0 ? props.results.missions.rejected / total : 0
})

// Find bottleneck resource (highest utilization)
const bottleneck = computed(() => {
  if (Object.keys(activeUnits.value).length === 0) return null

  let maxUtil = 0
  let bottleneckUnit = ''
  let bottleneckResource = ''

  for (const [unit, util] of Object.entries(activeUnits.value)) {
    if (util.pilot > maxUtil) {
      maxUtil = util.pilot
      bottleneckUnit = unit
      bottleneckResource = 'Pilot'
    }
    if (util.so > maxUtil) {
      maxUtil = util.so
      bottleneckUnit = unit
      bottleneckResource = 'SO'
    }
    if (util.aircraft > maxUtil) {
      maxUtil = util.aircraft
      bottleneckUnit = unit
      bottleneckResource = 'Aircraft'
    }
  }

  return maxUtil > 0 ? { unit: bottleneckUnit, resource: bottleneckResource, utilization: maxUtil } : null
})

// Calculate recommended headcount increase
const headcountRecommendation = computed(() => {
  if (Object.keys(activeUnits.value).length === 0) return null

  const recommendations: Array<{ unit: string; resource: string; current: number; recommended: number; increase: number }> = []

  for (const [unit, util] of Object.entries(activeUnits.value)) {
    // For pilot
    if (util.pilot > 0.85 && util.effective_crew) {
      const currentEffective = util.effective_crew.pilot
      const targetUtil = 0.75 // Target 75% utilization for safety margin
      const recommended = Math.ceil(currentEffective / targetUtil)
      const increase = recommended - currentEffective

      if (increase > 0) {
        // Account for availability factor to get raw headcount needed
        const availabilityFactor = util.availability_factors?.pilot || 1.0
        const rawRecommended = Math.ceil(recommended / availabilityFactor)
        const rawCurrent = util.initial_crew?.pilot || currentEffective
        const rawIncrease = rawRecommended - rawCurrent

        recommendations.push({
          unit,
          resource: 'Pilot',
          current: rawCurrent,
          recommended: rawRecommended,
          increase: rawIncrease
        })
      }
    }

    // For SO
    if (util.so > 0.85 && util.effective_crew) {
      const currentEffective = util.effective_crew.so
      const targetUtil = 0.75
      const recommended = Math.ceil(currentEffective / targetUtil)
      const increase = recommended - currentEffective

      if (increase > 0) {
        const availabilityFactor = util.availability_factors?.so || 1.0
        const rawRecommended = Math.ceil(recommended / availabilityFactor)
        const rawCurrent = util.initial_crew?.so || currentEffective
        const rawIncrease = rawRecommended - rawCurrent

        recommendations.push({
          unit,
          resource: 'SO',
          current: rawCurrent,
          recommended: rawRecommended,
          increase: rawIncrease
        })
      }
    }
  }

  return recommendations.length > 0 ? recommendations : null
})

// Mission type analysis with timing breakdown
const missionTypeAnalysis = computed(() => {
  if (!props.results?.by_type) return null

  // Calculate timing data from timeline for each mission type
  const timingByType: Record<string, {
    preflight: number[]
    mount: number[]
    transit_in: number[]
    flight: number[]
    transit_out: number[]
    postflight: number[]
    turnaround: number[]
  }> = {}

  if (props.results.timeline) {
    for (const item of props.results.timeline) {
      if (item.type === 'mission' && item.segments) {
        const missionType = item.mission_type
        if (!timingByType[missionType]) {
          timingByType[missionType] = {
            preflight: [],
            mount: [],
            transit_in: [],
            flight: [],
            transit_out: [],
            postflight: [],
            turnaround: []
          }
        }

        for (const segment of item.segments) {
          const duration = segment.end - segment.start
          const segmentName = segment.name as keyof typeof timingByType[string]
          if (timingByType[missionType][segmentName]) {
            timingByType[missionType][segmentName].push(duration)
          }
        }
      }
    }
  }

  const types = Object.entries(props.results.by_type).map(([type, data]) => {
    const timing = timingByType[type]
    const calculateAvg = (arr: number[]) => arr.length > 0 ? arr.reduce((sum, v) => sum + v, 0) / arr.length : 0
    const calculateTotal = (arr: number[]) => arr.reduce((sum, v) => sum + v, 0)

    return {
      type,
      requested: data.requested,
      completed: data.completed,
      rejected: data.rejected,
      successRate: data.requested > 0 ? data.completed / data.requested : 0,
      rejectionRate: data.requested > 0 ? data.rejected / data.requested : 0,
      timing: timing ? {
        preflight: { avg: calculateAvg(timing.preflight), total: calculateTotal(timing.preflight), count: timing.preflight.length },
        mount: { avg: calculateAvg(timing.mount), total: calculateTotal(timing.mount), count: timing.mount.length },
        transit_in: { avg: calculateAvg(timing.transit_in), total: calculateTotal(timing.transit_in), count: timing.transit_in.length },
        flight: { avg: calculateAvg(timing.flight), total: calculateTotal(timing.flight), count: timing.flight.length },
        transit_out: { avg: calculateAvg(timing.transit_out), total: calculateTotal(timing.transit_out), count: timing.transit_out.length },
        postflight: { avg: calculateAvg(timing.postflight), total: calculateTotal(timing.postflight), count: timing.postflight.length },
        turnaround: { avg: calculateAvg(timing.turnaround), total: calculateTotal(timing.turnaround), count: timing.turnaround.length }
      } : null
    }
  })

  // Sort by rejection rate (highest first)
  types.sort((a, b) => b.rejectionRate - a.rejectionRate)

  return types
})

// Overall timing totals across all mission types
const overallTimingTotals = computed(() => {
  if (!missionTypeAnalysis.value) return null

  const totals = {
    preflight: 0,
    mount: 0,
    transit_in: 0,
    flight: 0,
    transit_out: 0,
    postflight: 0,
    turnaround: 0,
    totalMissions: 0
  }

  for (const type of missionTypeAnalysis.value) {
    if (type.timing) {
      totals.preflight += type.timing.preflight.total
      totals.mount += type.timing.mount.total
      totals.transit_in += type.timing.transit_in.total
      totals.flight += type.timing.flight.total
      totals.transit_out += type.timing.transit_out.total
      totals.postflight += type.timing.postflight.total
      totals.turnaround += type.timing.turnaround.total
      totals.totalMissions += type.completed
    }
  }

  // Calculate averages
  const count = totals.totalMissions
  return {
    preflight: { total: totals.preflight, avg: count > 0 ? totals.preflight / count : 0 },
    mount: { total: totals.mount, avg: count > 0 ? totals.mount / count : 0 },
    transit_in: { total: totals.transit_in, avg: count > 0 ? totals.transit_in / count : 0 },
    flight: { total: totals.flight, avg: count > 0 ? totals.flight / count : 0 },
    transit_out: { total: totals.transit_out, avg: count > 0 ? totals.transit_out / count : 0 },
    postflight: { total: totals.postflight, avg: count > 0 ? totals.postflight / count : 0 },
    turnaround: { total: totals.turnaround, avg: count > 0 ? totals.turnaround / count : 0 },
    totalMissions: count,
    grandTotal: totals.preflight + totals.mount + totals.transit_in + totals.flight + totals.transit_out + totals.postflight + totals.turnaround
  }
})

// Throughput analysis
const throughputAnalysis = computed(() => {
  if (!props.results?.missions || !props.results?.horizon_hours) return null

  const horizon = props.results.horizon_hours
  const completed = props.results.missions.completed

  // Calculate missions per day
  const missionsPerDay = (completed / horizon) * 24

  // Calculate missions per week and month
  const missionsPerWeek = missionsPerDay * 7
  const missionsPerMonth = missionsPerDay * 30

  return {
    missionsPerDay: missionsPerDay.toFixed(1),
    missionsPerWeek: missionsPerWeek.toFixed(1),
    missionsPerMonth: missionsPerMonth.toFixed(0),
    completedTotal: completed,
    horizonHours: horizon
  }
})

// Resource efficiency comparison
const resourceEfficiency = computed(() => {
  if (Object.keys(activeUnits.value).length === 0) return null

  const efficiencies: Array<{ unit: string; resource: string; utilization: number; efficiency: string }> = []

  for (const [unit, util] of Object.entries(activeUnits.value)) {
    // Aircraft efficiency
    if (util.aircraft > 0) {
      let efficiency = 'optimal'
      if (util.aircraft < 0.5) efficiency = 'underutilized'
      else if (util.aircraft > 0.85) efficiency = 'strained'

      efficiencies.push({
        unit,
        resource: 'Aircraft',
        utilization: util.aircraft,
        efficiency
      })
    }

    // Pilot efficiency
    if (util.pilot > 0) {
      let efficiency = 'optimal'
      if (util.pilot < 0.5) efficiency = 'underutilized'
      else if (util.pilot > 0.85) efficiency = 'strained'

      efficiencies.push({
        unit,
        resource: 'Pilot',
        utilization: util.pilot,
        efficiency
      })
    }

    // SO efficiency
    if (util.so > 0) {
      let efficiency = 'optimal'
      if (util.so < 0.5) efficiency = 'underutilized'
      else if (util.so > 0.85) efficiency = 'strained'

      efficiencies.push({
        unit,
        resource: 'SO',
        utilization: util.so,
        efficiency
      })
    }
  }

  return efficiencies
})

// Rejection breakdown analysis
const rejectionBreakdown = computed(() => {
  if (!props.results?.rejections) return null

  const total = Object.values(props.results.rejections).reduce((sum, val) => sum + val, 0)
  if (total === 0) return null

  return [
    { reason: 'Aircraft', count: props.results.rejections.aircraft, percentage: props.results.rejections.aircraft / total },
    { reason: 'Pilot', count: props.results.rejections.pilot, percentage: props.results.rejections.pilot / total },
    { reason: 'SO', count: props.results.rejections.so, percentage: props.results.rejections.so / total },
    { reason: 'Payload', count: props.results.rejections.payload, percentage: props.results.rejections.payload / total },
  ].filter(item => item.count > 0).sort((a, b) => b.count - a.count)
})

// Primary constraint causing rejections
const primaryConstraint = computed(() => {
  if (!props.results?.rejections) return null

  const rejections = props.results.rejections
  const maxRejections = Math.max(rejections.aircraft, rejections.pilot, rejections.so, rejections.payload)

  if (maxRejections === 0) return null

  if (rejections.aircraft === maxRejections) return 'aircraft'
  if (rejections.pilot === maxRejections) return 'pilot'
  if (rejections.so === maxRejections) return 'SO'
  if (rejections.payload === maxRejections) return 'payload'

  return null
})

// Crew performance analysis
const crewPerformance = computed(() => {
  if (!props.results?.timeline) return null

  let totalMissionShifts = 0
  let pilotMissionShifts = 0
  let soMissionShifts = 0
  let totalDutyShifts = 0
  let totalODOShifts = 0
  let totalSDOShifts = 0
  let totalSDNCOShifts = 0

  // Get active unit names
  const activeUnitNames = Object.keys(activeUnits.value)

  // Analyze timeline for missions and duty shifts (only from active units)
  for (const item of props.results.timeline) {
    // Skip items from inactive units
    if (!activeUnitNames.includes(item.unit)) continue

    // Count individual crew shifts within missions
    if (item.type === 'mission' && item.crew) {
      // Count pilot shifts
      if (item.crew.pilots) {
        const pilotCount = item.crew.pilots.length
        pilotMissionShifts += pilotCount
        totalMissionShifts += pilotCount
      }
      // Count SO shifts
      if (item.crew.sos) {
        const soCount = item.crew.sos.length
        soMissionShifts += soCount
        totalMissionShifts += soCount
      }
    }

    // Count duty shifts
    if (item.type === 'duty') {
      totalDutyShifts++

      // Categorize by duty type
      const dutyType = item.duty_type?.toLowerCase()
      if (dutyType === 'odo') {
        totalODOShifts++
      } else if (dutyType === 'sdo') {
        totalSDOShifts++
      } else if (dutyType === 'sdnco') {
        totalSDNCOShifts++
      }
    }
  }

  return {
    totalMissionShifts,
    pilotMissionShifts,
    soMissionShifts,
    totalDutyShifts,
    totalODOShifts,
    totalSDOShifts,
    totalSDNCOShifts
  }
})

</script>

<template>
  <div class="analysis-tab">
    <!-- Tab Navigation -->
    <div class="tab-navigation">
      <button :class="['tab-btn', { active: activeTab === 'overview' }]" @click="activeTab = 'overview'">
        Overview
      </button>
      <button :class="['tab-btn', { active: activeTab === 'efficiency' }]" @click="activeTab = 'efficiency'">
        Resource Efficiency
      </button>
      <button :class="['tab-btn', { active: activeTab === 'mission-performance' }]"
        @click="activeTab = 'mission-performance'">
        Mission Performance
      </button>
      <button :class="['tab-btn', { active: activeTab === 'crew-performance' }]"
        @click="activeTab = 'crew-performance'">
        Crew Performance
      </button>
    </div>

    <!-- Overview Tab -->
    <div v-show="activeTab === 'overview'" class="analysis-sections">

      <!-- Performance Summary & Throughput Analysis - Side by Side -->
      <div class="two-column-grid">
        <!-- Performance Summary -->
        <div class="analysis-card">
          <div class="analysis-header">
            <span class="analysis-icon">📊</span>
            <span class="analysis-title">Performance Summary</span>
          </div>
          <div class="analysis-content">
            <div class="metric-row">
              <span class="metric-label">Mission Success Rate:</span>
              <span class="metric-value"
                :class="{ 'metric-success': rejectionRate < 0.05, 'metric-warning': rejectionRate >= 0.05 && rejectionRate < 0.2, 'metric-danger': rejectionRate >= 0.2 }">
                {{ formatPercent(1 - rejectionRate) }}
              </span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Total Rejections:</span>
              <span class="metric-value">{{ results.missions.rejected }} / {{ results.missions.requested }}</span>
            </div>
          </div>
        </div>

        <!-- Throughput Analysis -->
        <div v-if="throughputAnalysis" class="analysis-card">
          <div class="analysis-header">
            <span class="analysis-icon">🚀</span>
            <span class="analysis-title">Throughput Analysis</span>
          </div>
          <div class="analysis-content">
            <div class="metric-row">
              <span class="metric-label">Missions/Day:</span>
              <span class="metric-value">{{ throughputAnalysis.missionsPerDay }}</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Missions/Week:</span>
              <span class="metric-value">{{ throughputAnalysis.missionsPerWeek }}</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Missions/Month:</span>
              <span class="metric-value">{{ throughputAnalysis.missionsPerMonth }}</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Simulation Period:</span>
              <span class="metric-value">{{ (throughputAnalysis.horizonHours / 24).toFixed(1) }} days</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Rejection Breakdown -->
      <div v-if="rejectionBreakdown" class="analysis-card rejection-card">
        <div class="analysis-header">
          <span class="analysis-icon">🚫</span>
          <span class="analysis-title">Rejection Breakdown</span>
        </div>
        <div class="analysis-content">
          <div v-for="item in rejectionBreakdown" :key="item.reason" class="rejection-item">
            <div class="rejection-bar-container">
              <div class="rejection-label">{{ item.reason }}</div>
              <div class="rejection-bar-wrapper">
                <div class="rejection-bar" :style="{ width: formatPercent(item.percentage) }"></div>
              </div>
              <div class="rejection-value">{{ item.count }} ({{ formatPercent(item.percentage) }})</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottleneck & Coverage - Side by Side -->
      <div class="two-column-grid">
        <!-- Bottleneck Analysis -->
        <div v-if="bottleneck" class="analysis-card bottleneck-card">
          <div class="analysis-header">
            <span class="analysis-icon">⚠️</span>
            <span class="analysis-title">Bottleneck Identified</span>
          </div>
          <div class="analysis-content">
            <p class="bottleneck-text">
              <strong>{{ bottleneck.resource }}</strong> at <strong>{{ bottleneck.unit }}</strong>
              is the primary bottleneck with <strong>{{ formatPercent(bottleneck.utilization) }}</strong> utilization.
            </p>
            <p class="bottleneck-hint" v-if="bottleneck.utilization > 0.9">
              🚨 Critical: This resource is severely overutilized. Mission failures are likely.
            </p>
            <p class="bottleneck-hint" v-else-if="bottleneck.utilization > 0.8">
              ⚡ Warning: This resource is approaching capacity. Consider increasing headcount.
            </p>
          </div>
        </div>

        <!-- Coverage Assessment -->
        <div class="analysis-card coverage-card">
          <div class="analysis-header">
            <span class="analysis-icon">✅</span>
            <span class="analysis-title">Coverage Assessment</span>
          </div>
          <div class="analysis-content">
            <div v-if="rejectionRate === 0" class="coverage-status coverage-full">
              <strong>✓ Full Coverage Achieved</strong>
              <p>All missions were successfully executed with current resource levels.</p>
            </div>
            <div v-else-if="rejectionRate < 0.05" class="coverage-status coverage-good">
              <strong>⚡ Adequate Coverage</strong>
              <p>{{ formatPercent(1 - rejectionRate) }} of missions executed. Minor gaps exist but acceptable.</p>
              <p v-if="primaryConstraint" class="constraint-hint">Primary constraint: {{ primaryConstraint }}</p>
            </div>
            <div v-else-if="rejectionRate < 0.2" class="coverage-status coverage-warning">
              <strong>⚠️ Insufficient Coverage</strong>
              <p>{{ formatPercent(rejectionRate) }} rejection rate indicates significant resource gaps.</p>
              <p v-if="primaryConstraint" class="constraint-hint">Primary constraint: {{ primaryConstraint }}</p>
            </div>
            <div v-else class="coverage-status coverage-critical">
              <strong>🚨 Critical Resource Shortage</strong>
              <p>{{ formatPercent(rejectionRate) }} rejection rate. Cannot sustain operations at this level.</p>
              <p v-if="primaryConstraint" class="constraint-hint">Primary constraint: {{ primaryConstraint }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Headcount Recommendations -->
      <div v-if="headcountRecommendation" class="analysis-card recommendation-card">
        <div class="analysis-header">
          <span class="analysis-icon">👥</span>
          <span class="analysis-title">Headcount Recommendations</span>
        </div>
        <div class="analysis-content">
          <div class="recommendation-intro">
            To achieve 75% target utilization (providing operational buffer), consider:
          </div>
          <div v-for="rec in headcountRecommendation" :key="`${rec.unit}-${rec.resource}`" class="recommendation-item">
            <div class="rec-resource">
              <strong>{{ rec.resource }}</strong> at <strong>{{ rec.unit }}</strong>
            </div>
            <div class="rec-numbers">
              <span class="rec-current">Current: {{ rec.current }}</span>
              <span class="rec-arrow">→</span>
              <span class="rec-recommended">Recommended: {{ rec.recommended }}</span>
              <span class="rec-increase">(+{{ rec.increase }})</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Resource Efficiency Tab -->
    <div v-show="activeTab === 'efficiency'" class="analysis-sections">
      <div v-if="resourceEfficiency">
        <div v-for="eff in resourceEfficiency" :key="`${eff.unit}-${eff.resource}`" class="efficiency-item">
          <div class="efficiency-header">
            <strong>{{ eff.resource }}</strong> at <strong>{{ eff.unit }}</strong>
          </div>
          <div class="efficiency-bar-container">
            <div class="efficiency-bar-wrapper">
              <div class="efficiency-bar" :class="`efficiency-${eff.efficiency}`"
                :style="{ width: formatPercent(eff.utilization) }">
              </div>
            </div>
            <span class="efficiency-value">{{ formatPercent(eff.utilization) }}</span>
            <span class="efficiency-badge" :class="`badge-${eff.efficiency}`">
              {{ eff.efficiency }}
            </span>
          </div>
        </div>
      </div>
      <div v-else class="no-data">
        No resource efficiency data available
      </div>
    </div>

    <!-- Mission Type Performance Tab -->
    <div v-show="activeTab === 'mission-performance'" class="analysis-sections">
      <div v-if="missionTypeAnalysis">
        <div v-for="type in missionTypeAnalysis" :key="type.type" class="mission-performance-item">
          <div class="mission-performance-header">
            <strong>{{ type.type }}</strong>
          </div>
          <div class="mission-performance-stats">
            <div class="mission-stat">
              <span class="stat-label">Requested:</span>
              <span class="stat-value">{{ type.requested }}</span>
            </div>
            <div class="mission-stat">
              <span class="stat-label">Completed:</span>
              <span class="stat-value metric-success">{{ type.completed }}</span>
            </div>
            <div class="mission-stat">
              <span class="stat-label">Rejected:</span>
              <span class="stat-value" :class="type.rejected > 0 ? 'metric-danger' : ''">{{ type.rejected }}</span>
            </div>
            <div class="mission-stat">
              <span class="stat-label">Success Rate:</span>
              <span class="stat-value"
                :class="{ 'metric-success': type.successRate >= 0.95, 'metric-warning': type.successRate >= 0.8 && type.successRate < 0.95, 'metric-danger': type.successRate < 0.8 }">
                {{ formatPercent(type.successRate) }}
              </span>
            </div>
          </div>

          <!-- Timing Breakdown -->
          <div v-if="type.timing" class="timing-breakdown">
            <div class="timing-header">Phase Timing (hours)</div>
            <div class="timing-grid">
              <div class="timing-item">
                <span class="timing-label">Preflight:</span>
                <span class="timing-value">{{ type.timing.preflight.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ type.timing.preflight.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">Mount:</span>
                <span class="timing-value">{{ type.timing.mount.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ type.timing.mount.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">Transit In:</span>
                <span class="timing-value">{{ type.timing.transit_in.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ type.timing.transit_in.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">On Station:</span>
                <span class="timing-value">{{ type.timing.flight.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ type.timing.flight.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">Transit Out:</span>
                <span class="timing-value">{{ type.timing.transit_out.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ type.timing.transit_out.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">Postflight:</span>
                <span class="timing-value">{{ type.timing.postflight.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ type.timing.postflight.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">Turnaround:</span>
                <span class="timing-value">{{ type.timing.turnaround.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ type.timing.turnaround.avg.toFixed(2) }} avg</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Overall Totals -->
        <div v-if="overallTimingTotals" class="mission-performance-item totals-item">
          <div class="mission-performance-header">
            <strong>ALL MISSIONS - TOTAL</strong>
          </div>
          <div class="mission-performance-stats">
            <div class="mission-stat">
              <span class="stat-label">Completed Missions:</span>
              <span class="stat-value">{{ overallTimingTotals.totalMissions }}</span>
            </div>
            <div class="mission-stat">
              <span class="stat-label">Grand Total Hours:</span>
              <span class="stat-value metric-success">{{ overallTimingTotals.grandTotal.toFixed(1) }}</span>
            </div>
          </div>

          <!-- Overall Timing Breakdown -->
          <div class="timing-breakdown">
            <div class="timing-header">Overall Phase Timing (hours)</div>
            <div class="timing-grid">
              <div class="timing-item">
                <span class="timing-label">Preflight:</span>
                <span class="timing-value">{{ overallTimingTotals.preflight.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ overallTimingTotals.preflight.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">Mount:</span>
                <span class="timing-value">{{ overallTimingTotals.mount.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ overallTimingTotals.mount.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">Transit In:</span>
                <span class="timing-value">{{ overallTimingTotals.transit_in.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ overallTimingTotals.transit_in.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">On Station:</span>
                <span class="timing-value">{{ overallTimingTotals.flight.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ overallTimingTotals.flight.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">Transit Out:</span>
                <span class="timing-value">{{ overallTimingTotals.transit_out.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ overallTimingTotals.transit_out.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">Postflight:</span>
                <span class="timing-value">{{ overallTimingTotals.postflight.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ overallTimingTotals.postflight.avg.toFixed(2) }} avg</span>
              </div>
              <div class="timing-item">
                <span class="timing-label">Turnaround:</span>
                <span class="timing-value">{{ overallTimingTotals.turnaround.total.toFixed(1) }}</span>
                <span class="timing-avg">{{ overallTimingTotals.turnaround.avg.toFixed(2) }} avg</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="no-data">
        No mission type performance data available
      </div>
    </div>

    <!-- Crew Performance Tab -->
    <div v-show="activeTab === 'crew-performance'" class="analysis-sections">
      <div v-if="crewPerformance">
        <div class="two-column-grid">
          <!-- Mission Shifts -->
          <div class="analysis-card">
            <div class="analysis-header">
              <span class="analysis-icon">✈️</span>
              <span class="analysis-title">Mission Shifts</span>
            </div>
            <div class="analysis-content">
              <div class="metric-row">
                <span class="metric-label">Pilot Shifts:</span>
                <span class="metric-value">{{ crewPerformance.pilotMissionShifts }}</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">SO Shifts:</span>
                <span class="metric-value">{{ crewPerformance.soMissionShifts }}</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">Total Mission Shifts:</span>
                <span class="metric-value">{{ crewPerformance.totalMissionShifts }}</span>
              </div>
            </div>
          </div>

          <!-- Duty Summary -->
          <div class="analysis-card">
            <div class="analysis-header">
              <span class="analysis-icon">🛡️</span>
              <span class="analysis-title">Duty Summary</span>
            </div>
            <div class="analysis-content">
              <div class="metric-row">
                <span class="metric-label">ODO Shifts:</span>
                <span class="metric-value">{{ crewPerformance.totalODOShifts }}</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">SDO Shifts:</span>
                <span class="metric-value">{{ crewPerformance.totalSDOShifts }}</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">SDNCO Shifts:</span>
                <span class="metric-value">{{ crewPerformance.totalSDNCOShifts }}</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">Total Duty Shifts:</span>
                <span class="metric-value">{{ crewPerformance.totalDutyShifts }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="no-data">
        No crew performance data available
      </div>
    </div>
  </div>
</template>

<style scoped>
.analysis-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Tab Navigation */
.tab-navigation {
  display: flex;
  gap: 4px;
  margin-top: -16px;
  margin-bottom: 16px;
  border-bottom: 2px solid var(--border-color);
  position: static !important;
  z-index: 0;
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-muted-color);
  transition: all 0.2s ease;
  position: relative;
}

.tab-btn:hover {
  color: var(--text-color);
  background: rgba(59, 130, 246, 0.05);
}

.tab-btn.active {
  color: var(--accent-blue);
  border-bottom-color: var(--accent-blue);
  background: rgba(59, 130, 246, 0.08);
}

.tab-panel {
  display: block;
}

.no-data {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted-color);
  font-style: italic;
}

/* Analysis Sections */
.analysis-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Two Column Grid Layout */
.two-column-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

@media (max-width: 1024px) {
  .two-column-grid {
    grid-template-columns: 1fr;
  }
}

.section-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 12px;
  color: var(--text-color);
}

.analysis-card {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
}

.bottleneck-card {
  background: rgba(0, 0, 0, 0.02);
}

.recommendation-card {
  background: rgba(0, 0, 0, 0.02);
}

.coverage-card {
  background: rgba(0, 0, 0, 0.02);
}

.rejection-card {
  background: rgba(0, 0, 0, 0.02);
}

.efficiency-card {
  background: rgba(0, 0, 0, 0.02);
}

.mission-performance-card {
  background: rgba(0, 0, 0, 0.02);
}

.analysis-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.analysis-icon {
  font-size: 1rem;
  opacity: 0.7;
}

.analysis-title {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-color);
}

.analysis-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.metric-label {
  font-size: 0.85rem;
  color: var(--text-muted-color);
}

.metric-value {
  font-size: 0.95rem;
  font-weight: 700;
  font-family: monospace;
}

.metric-success {
  color: #10b981;
}

.metric-warning {
  color: #f59e0b;
}

.metric-danger {
  color: #ef4444;
}

/* Rejection Breakdown */
.rejection-item {
  padding: 8px 0;
}

.rejection-bar-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rejection-label {
  width: 80px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
}

.rejection-bar-wrapper {
  flex: 1;
  height: 20px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.rejection-bar {
  height: 100%;
  background: linear-gradient(to right, #ef4444, #dc2626);
  transition: width 0.3s ease;
}

.rejection-value {
  width: 100px;
  text-align: right;
  font-size: 0.85rem;
  font-family: monospace;
  color: var(--text-color);
}

/* Efficiency Items */
.efficiency-item {
  padding: 10px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-bottom: 8px;
}

.efficiency-item:last-child {
  margin-bottom: 0;
}

.efficiency-header {
  font-size: 0.9rem;
  color: var(--text-color);
  margin-bottom: 8px;
}

.efficiency-bar-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.efficiency-bar-wrapper {
  flex: 1;
  height: 24px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.efficiency-bar {
  height: 100%;
  transition: width 0.3s ease;
}

.efficiency-optimal {
  background: linear-gradient(to right, #10b981, #059669);
}

.efficiency-underutilized {
  background: linear-gradient(to right, #3b82f6, #2563eb);
}

.efficiency-strained {
  background: linear-gradient(to right, #f59e0b, #d97706);
}

.efficiency-value {
  width: 60px;
  text-align: center;
  font-size: 0.85rem;
  font-family: monospace;
  font-weight: 600;
  color: var(--text-color);
}

.efficiency-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-optimal {
  background: rgba(16, 185, 129, 0.2);
  color: #059669;
}

.badge-underutilized {
  background: rgba(59, 130, 246, 0.2);
  color: #2563eb;
}

.badge-strained {
  background: rgba(245, 158, 11, 0.2);
  color: #d97706;
}

/* Mission Type Items */
.mission-performance-item {
  padding: 10px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-bottom: 8px;
}

.mission-performance-item:last-child {
  margin-bottom: 0;
}

.totals-item {
  background: rgba(59, 130, 246, 0.05);
  border: 2px solid var(--accent-blue);
  margin-top: 16px;
}

.totals-item .mission-performance-header strong {
  color: var(--accent-blue);
  font-size: 1rem;
  letter-spacing: 0.5px;
}

.mission-performance-header {
  font-size: 0.9rem;
  color: var(--text-color);
  margin-bottom: 8px;
}

.mission-performance-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.mission-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted-color);
}

.stat-value {
  font-size: 0.9rem;
  font-weight: 600;
  font-family: monospace;
  color: var(--text-color);
}

/* Timing Breakdown */
.timing-breakdown {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.timing-header {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted-color);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.timing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.timing-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 3px;
}

.timing-label {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-weight: 500;
}

.timing-value {
  font-size: 1.1rem;
  font-weight: 700;
  font-family: monospace;
  color: var(--text-color);
}

.timing-avg {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-family: monospace;
}

.bottleneck-text {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-color);
  line-height: 1.5;
}

.bottleneck-hint {
  margin: 8px 0 0 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-muted-color);
}

.recommendation-intro {
  font-size: 0.85rem;
  color: var(--text-muted-color);
  margin-bottom: 8px;
}

.recommendation-item {
  padding: 10px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-bottom: 8px;
}

.recommendation-item:last-child {
  margin-bottom: 0;
}

.rec-resource {
  font-size: 0.9rem;
  color: var(--text-color);
  margin-bottom: 6px;
}

.rec-numbers {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85rem;
  font-family: monospace;
}

.rec-current {
  color: var(--text-muted-color);
}

.rec-arrow {
  color: var(--accent-blue);
  font-weight: bold;
}

.rec-recommended {
  color: var(--text-color);
  font-weight: 600;
}

.rec-increase {
  color: #10b981;
  font-weight: 700;
}

.coverage-status {
  padding: 12px;
  border-radius: 4px;
}

.coverage-status strong {
  display: block;
  margin-bottom: 6px;
  font-size: 0.95rem;
}

.coverage-status p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--text-muted-color);
}

.coverage-full {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
}

.coverage-full strong {
  color: #10b981;
}

.coverage-good {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
}

.coverage-good strong {
  color: #3b82f6;
}

.coverage-warning {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
}

.coverage-warning strong {
  color: #f59e0b;
}

.coverage-critical {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
}

.coverage-critical strong {
  color: #ef4444;
}

.constraint-hint {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 0.8rem;
  font-style: italic;
  text-transform: capitalize;
}

/* Duty Stats Grid */
.duty-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.duty-stat-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  text-align: center;
}

.duty-stat-label {
  font-size: 0.85rem;
  color: var(--text-muted-color);
  font-weight: 500;
}

.duty-stat-value {
  font-size: 1.8rem;
  font-weight: 700;
  font-family: monospace;
  color: var(--text-color);
}

.duty-stat-percentage {
  font-size: 0.8rem;
  color: var(--text-muted-color);
  font-family: monospace;
}

@media (max-width: 768px) {
  .rec-numbers {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .mission-performance-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .rejection-bar-container {
    flex-wrap: wrap;
  }

  .rejection-label {
    width: 100%;
  }

  .rejection-value {
    width: auto;
  }

  .duty-stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>

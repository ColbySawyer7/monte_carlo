<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { load, save } from './composables/useLocalStorage'

import Aircraft from './views/instance/Aircraft.vue'
import Payload from './views/instance/Payload.vue'
import Staffing from './views/instance/Staffing.vue'
import Unit from './views/instance/Unit.vue'

import Monte from './views/sim/Monte.vue'
import DES from './views/sim/DES.vue'
import DESconfigInspector from './views/sim/DESconfigInspector.vue'

import Training from './views/reference/Training.vue'
import Readiness from './views/reference/Readiness.vue'
import Conditions from './views/reference/Conditions.vue'

import { MODE, VERSION } from './constants'

const activeTab = ref('aircraft')
const isDarkMode = ref(false)

// Initialize theme and active tab from localStorage
onMounted(() => {
  const savedTheme = load<string>('theme')
  if (savedTheme) {
    isDarkMode.value = savedTheme === 'dark'
  }
  applyTheme()

  const savedTab = load<string>('activeTab')
  if (savedTab) {
    activeTab.value = savedTab
  }
})

function toggleTheme() {
  isDarkMode.value = !isDarkMode.value
  applyTheme()
  save('theme', isDarkMode.value ? 'dark' : 'light')
}

function setActiveTab(tab: string) {
  activeTab.value = tab
  save('activeTab', tab)
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', isDarkMode.value ? 'dark' : 'light')
}
</script>

<template>
  <div id="app">
    <header>
      <div class="version">
        <span>v{{ VERSION }}</span>
        <span class="mode">{{ MODE }}</span>
      </div>
      <h1>Squadron Operational Readiness (SOR) Simulation</h1>
      <button class="theme-toggle" @click="toggleTheme">
        {{ isDarkMode ? 'Light Mode' : 'Dark Mode' }}
      </button>
    </header>

    <main>
      <!-- Tab Navigation -->
      <nav class="tab-navigation">

        <!-- Instance Data -->
        <div class="tab-section tab-section-left">
          <span class="tab-section-label">Instance Data</span>
          <div class="tab-group">
            <button class="tab-btn" :class="{ active: activeTab === 'aircraft' }" @click="setActiveTab('aircraft')">
              Aircraft
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'payload' }" @click="setActiveTab('payload')">
              Payload
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'staffing' }" @click="setActiveTab('staffing')">
              Staffing
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'unit' }" @click="setActiveTab('unit')">
              Unit
            </button>
          </div>
        </div>

        <!-- Sim Models -->
        <div class="tab-section tab-section-center">
          <span class="tab-section-label">Simulation Models</span>
          <div class="tab-group">
            <button class="tab-btn" :class="{ active: activeTab === 'monte' }" @click="setActiveTab('monte')">
              Monte
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'des' }" @click="setActiveTab('des')">
              DES
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'config' }" @click="setActiveTab('config')">
              DES Config Inspector
            </button>
          </div>
        </div>

        <!-- Reference Data -->
        <div class="tab-section tab-section-right">
          <span class="tab-section-label">Reference Data</span>
          <div class="tab-group">
            <button class="tab-btn" :class="{ active: activeTab === 'training' }" @click="setActiveTab('training')">
              Training
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'readiness' }" @click="setActiveTab('readiness')">
              Readiness
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'conditions' }" @click="setActiveTab('conditions')">
              Conditions
            </button>
          </div>
        </div>
      </nav>

      <!-- Tab Content -->
      <div class="tab-content-area">
        <Aircraft v-if="activeTab === 'aircraft'" />
        <Payload v-else-if="activeTab === 'payload'" />
        <Staffing v-else-if="activeTab === 'staffing'" />
        <Unit v-else-if="activeTab === 'unit'" />
        <Monte v-else-if="activeTab === 'monte'" />
        <DES v-else-if="activeTab === 'des'" />
        <DESconfigInspector v-else-if="activeTab === 'config'" />
        <Training v-else-if="activeTab === 'training'" />
        <Readiness v-else-if="activeTab === 'readiness'" />
        <Conditions v-else-if="activeTab === 'conditions'" />
      </div>
    </main>
  </div>
</template>

<style>
@import './assets/styles.css';
</style>

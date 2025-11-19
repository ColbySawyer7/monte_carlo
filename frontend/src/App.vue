<script setup lang="ts">
import { ref, onMounted } from 'vue'

import Aircraft from './views/Aircraft.vue'
import Payload from './views/Payload.vue'
import Staffing from './views/Staffing.vue'
import Unit from './views/Unit.vue'

import DES from './views/DES.vue'
import Monte from './views/Monte.vue'

import Training from './views/Training.vue'
import Readiness from './views/Readiness.vue'
import Conditions from './views/Conditions.vue'

import { MODE, VERSION } from './constants'

const activeTab = ref('aircraft')
const isDarkMode = ref(true)

// Initialize theme from localStorage or default to dark
onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    isDarkMode.value = savedTheme === 'dark'
  }
  applyTheme()
})

function toggleTheme() {
  isDarkMode.value = !isDarkMode.value
  applyTheme()
  localStorage.setItem('theme', isDarkMode.value ? 'dark' : 'light')
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
            <button class="tab-btn" :class="{ active: activeTab === 'aircraft' }" @click="activeTab = 'aircraft'">
              Aircraft
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'payload' }" @click="activeTab = 'payload'">
              Payload
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'staffing' }" @click="activeTab = 'staffing'">
              Staffing
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'unit' }" @click="activeTab = 'unit'">
              Unit
            </button>
          </div>
        </div>

        <!-- Sim Models -->
        <div class="tab-section tab-section-center">
          <span class="tab-section-label">Simulation Models</span>
          <div class="tab-group">
            <button class="tab-btn" :class="{ active: activeTab === 'monte' }" @click="activeTab = 'monte'">
              Monte
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'des' }" @click="activeTab = 'des'">
              DES
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'abs' }" @click="activeTab = 'abs'">
              ABS
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'sd' }" @click="activeTab = 'sd'">
              SD
            </button>
          </div>
        </div>

        <!-- Reference Data -->
        <div class="tab-section tab-section-right">
          <span class="tab-section-label">Reference Data</span>
          <div class="tab-group">
            <button class="tab-btn" :class="{ active: activeTab === 'training' }" @click="activeTab = 'training'">
              Training
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'readiness' }" @click="activeTab = 'readiness'">
              Readiness
            </button>
            <button class="tab-btn" :class="{ active: activeTab === 'conditions' }" @click="activeTab = 'conditions'">
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
        <div v-else-if="activeTab === 'abs'" class="tab-panel">
          ABS content
        </div>
        <div v-else-if="activeTab === 'sd'" class="tab-panel">
          SD content
        </div>
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

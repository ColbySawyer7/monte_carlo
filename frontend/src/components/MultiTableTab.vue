<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Table from './Table.vue'
import { getTable, type StateTable } from '../state'

interface TableConfig {
  tableKey: string
  subtitle?: string
  subdescription?: string
}

interface Props {
  title: string
  description: string
  tables: TableConfig[]
  layout?: 'vertical' | 'grid-3' | 'grid-2x3'
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'vertical'
})

const loading = ref(true)
const error = ref('')
const tableData = ref<StateTable[]>([])

onMounted(async () => {
  try {
    const promises = props.tables.map(t => getTable(t.tableKey))
    tableData.value = await Promise.all(promises)
  } catch (e) {
    error.value = e instanceof Error ? e.message : `Failed to load ${props.title} data`
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="tab-content">
    <h2>{{ title }}</h2>
    <p class="tab-description">
      {{ description }}
    </p>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else :class="['tables-container', `layout-${layout}`]">
      <div v-for="(table, index) in tables" :key="table.tableKey" class="table-section">
        <h3 v-if="table.subtitle" class="table-subtitle">{{ table.subtitle }}</h3>
        <p v-if="table.subdescription" class="table-subdescription">{{ table.subdescription }}</p>
        <Table v-if="tableData[index]" :fields="tableData[index].fields" :rows="tableData[index].rows" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-content {
  padding: 20px;
}

.tab-content h2 {
  margin: 0 0 8px 0;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.tab-description {
  color: var(--text-muted-color);
  margin-bottom: 20px;
  font-size: 0.9rem;
}

.tables-container.layout-vertical .table-section {
  margin-top: 32px;
}

.tables-container.layout-vertical .table-section:first-of-type {
  margin-top: 0;
}

.tables-container.layout-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.tables-container.layout-grid-2x3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.table-subtitle {
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 600;
}

.table-subdescription {
  color: var(--text-muted-color);
  margin-bottom: 16px;
  font-size: 0.85rem;
}

.loading,
.error {
  padding: 40px;
  text-align: center;
  color: var(--text-muted-color);
}

.error {
  color: #ef4444;
}
</style>

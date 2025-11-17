<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  fields: string[]
  rows: Record<string, any>[]
}

const props = defineProps<Props>()

// State
const searchQuery = ref('')
const sortKey = ref(props.fields[0] || '')
const sortDir = ref<'asc' | 'desc'>('asc')

// Computed: Filtered rows
const filteredRows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.rows

  return props.rows.filter((row) =>
    props.fields.some((field) => {
      const value = row[field]
      return (value == null ? '' : String(value)).toLowerCase().includes(query)
    })
  )
})

// Computed: Sorted rows
const filteredAndSortedRows = computed(() => {
  if (!sortKey.value) return filteredRows.value

  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...filteredRows.value].sort((a, b) => {
    const aVal = a[sortKey.value]
    const bVal = b[sortKey.value]
    const aStr = aVal == null ? '' : String(aVal)
    const bStr = bVal == null ? '' : String(bVal)

    // Numeric comparison if both are numbers
    const aNum = Number(aStr)
    const bNum = Number(bStr)
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return (aNum - bNum) * dir
    }

    // String comparison
    return aStr.localeCompare(bStr) * dir
  })
})

// Toggle sort
function toggleSort(field: string) {
  if (sortKey.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = field
    sortDir.value = 'asc'
  }
}
</script>

<template>
  <div class="table-container">
    <!-- Search -->
    <input v-model="searchQuery" type="search" class="table-search" placeholder="Search…" />
    <!-- Table -->
    <table class="data-table">
      <thead>
        <tr>
          <th v-for="field in fields" :key="field" @click="toggleSort(field)" :class="{
            'sort-asc': sortKey === field && sortDir === 'asc',
            'sort-desc': sortKey === field && sortDir === 'desc',
          }">
            {{ field }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, idx) in filteredAndSortedRows" :key="idx">
          <td v-for="field in fields" :key="field">
            {{ row[field] ?? '' }}
          </td>
        </tr>
      </tbody>
    </table>
    <!-- Empty state -->
    <div v-if="!filteredAndSortedRows.length" class="no-data">
      No data to display
    </div>
  </div>
</template>

<style scoped>
.table-container {
  width: 100%;
}

.table-search {
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  background: var(--bg-color);
  color: var(--text-color);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.data-table th {
  text-align: left;
  padding: 10px;
  background: var(--panel-color);
  border-bottom: 2px solid var(--border-color);
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  position: relative;
}

.data-table th:hover {
  background: rgba(59, 130, 246, 0.1);
}

.data-table th.sort-asc::after {
  content: ' ▲';
  font-size: 0.7em;
  opacity: 0.6;
}

.data-table th.sort-desc::after {
  content: ' ▼';
  font-size: 0.7em;
  opacity: 0.6;
}

.data-table td {
  padding: 10px;
  border-bottom: 1px solid var(--border-color);
}

.data-table tbody tr:hover {
  background: rgba(59, 130, 246, 0.05);
}

.no-data {
  padding: 40px;
  text-align: center;
  color: var(--text-muted-color);
  font-style: italic;
}
</style>

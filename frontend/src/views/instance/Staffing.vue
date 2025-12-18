<script setup lang="ts">
import MultiTableTab from '../../components/MultiTableTab.vue'
</script>

<template>
  <MultiTableTab title="STAFFING"
    description="Personnel information including name, rank, MOS, unit assignment, and training status."
    :tables="[{ tableKey: 'v_staffing' }]" />
</template>

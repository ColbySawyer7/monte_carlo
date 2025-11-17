<script setup lang="ts">
import MultiTableTab from '../components/MultiTableTab.vue'
</script>

<template>
  <MultiTableTab title="AIRCRAFT"
    description="Includes aircraft information such as type, status, assigned payloads, and unit ownership and location."
    :tables="[{ tableKey: 'v_aircraft' }]" />
</template>
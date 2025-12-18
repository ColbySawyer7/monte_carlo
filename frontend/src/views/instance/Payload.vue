<script setup lang="ts">
import MultiTableTab from '../../components/MultiTableTab.vue'
</script>

<template>
  <MultiTableTab title="PAYLOAD"
    description="All payloads throughout the fleet, including type, status, and assigned aircraft. Unmounted payloads are also listed."
    :tables="[{ tableKey: 'v_payload' }]" />
</template>
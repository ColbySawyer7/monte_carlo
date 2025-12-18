<script setup lang="ts">
import MultiTableTab from '../../components/MultiTableTab.vue'
</script>

<template>
  <MultiTableTab title="TRAINING" description="View training requirements for missions and MOS roles." :tables="[
    {
      tableKey: 'v_missions',
      subtitle: 'Missions'
    },
    {
      tableKey: 'v_training',
      subtitle: 'Training Requirements'
    }
  ]" />
</template>

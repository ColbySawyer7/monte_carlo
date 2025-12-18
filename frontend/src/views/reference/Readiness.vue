<script setup lang="ts">
import MultiTableTab from '../../components/MultiTableTab.vue'
</script>

<template>
  <MultiTableTab title="READINESS" description="Thresholds used to compute equipment, staffing, and training readiness."
    layout="grid-3" :tables="[
      {
        tableKey: 'v_strength_equipment',
        subtitle: 'Equipment Readiness',
        subdescription: 'Aircraft and payload threshold settings.'
      },
      {
        tableKey: 'v_strength_staffing',
        subtitle: 'Staffing Readiness',
        subdescription: 'Personnel fill and critical MOS threshold settings.'
      },
      {
        tableKey: 'v_strength_training',
        subtitle: 'Training Readiness',
        subdescription: 'Minimum qualified count threshold settings.'
      }
    ]" />
</template>

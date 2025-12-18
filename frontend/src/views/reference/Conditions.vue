<script setup lang="ts">
import MultiTableTab from '../../components/MultiTableTab.vue'
</script>

<template>
  <MultiTableTab title="CONDITIONS" description="Reference: MCT 5.4.1.2.3 ES Data" layout="grid-2x3" :tables="[
    {
      tableKey: 'v_visibility',
      subtitle: 'Visibility',
      subdescription: 'Visibility bands and ranges.'
    },
    {
      tableKey: 'v_airspace',
      subtitle: 'Airspace',
      subdescription: 'Airspace restrictions and categories.'
    },
    {
      tableKey: 'v_ceiling',
      subtitle: 'Ceiling',
      subdescription: 'Ceiling bands and altitude thresholds.'
    },
    {
      tableKey: 'v_spectrum',
      subtitle: 'Spectrum',
      subdescription: 'Spectrum environment conditions.'
    },
    {
      tableKey: 'v_connectivity',
      subtitle: 'Connectivity',
      subdescription: 'Data link availability states.'
    },
    {
      tableKey: 'v_air_superiority',
      subtitle: 'Air Superiority',
      subdescription: 'Local to full air superiority levels.'
    }
  ]" />
</template>
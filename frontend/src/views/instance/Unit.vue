<script setup lang="ts">
import MultiTableTab from '../../components/MultiTableTab.vue'
</script>

<template>
  <MultiTableTab title="UNIT" description="Unit level summaries of aircraft, payloads, and personnel readiness."
    :tables="[
      {
        tableKey: 'v_unit',
        subtitle: 'Unit Overview',
        subdescription: 'Per-unit summary of aircraft, payload, and personnel counts.'
      },
      {
        tableKey: 'v_unit_payload_readiness',
        subtitle: 'Unit Payload Readiness',
        subdescription: 'Per unit payload authorization vs actual payload counts.'
      },
      {
        tableKey: 'v_unit_mos_readiness',
        subtitle: 'Unit MOS Readiness',
        subdescription: 'Per unit MOS authorization vs actual MOS counts.'
      }
    ]" />
</template>
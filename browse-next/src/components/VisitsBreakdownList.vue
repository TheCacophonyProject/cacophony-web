<script setup lang="ts">
// Gets visits, divides into chunks of one "night".
// Farms out to visit breakdown dropdown component.

import { computed } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";

const visitsByNight = computed<ApiVisitResponse[][]>((visits: ApiVisitResponse[]) => {
  return [];
});
</script>
<template>
  <div>
    <visits-daily-breakdown
      v-for="(visits, index) in visitsByNight"
      :key="index"
      :visits="visits"
    />
  </div>
</template>

<style scoped lang="less"></style>

<script setup lang="ts">
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import { computed } from "vue";
import { visitsCountBySpecies as visitsCountBySpeciesCalc } from "@models/VisitsUtils";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { visits } = defineProps<{ visits: ApiVisitResponse[] }>();

const visitCountBySpecies = computed(() => visitsCountBySpeciesCalc(visits));
</script>
<template>
  <div>
    <div class="header"></div>
    <div class="visits-species-count">
      <div
        v-for="([classification, count], index) in visitCountBySpecies"
        :class="[classification]"
        :key="index"
      >
        <span>{{ count }}</span>
        <span>{{ classification }}</span>
      </div>
    </div>
  </div>
</template>
<style scoped lang="less"></style>

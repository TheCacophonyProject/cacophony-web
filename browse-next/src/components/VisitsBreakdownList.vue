<script setup lang="ts">
// Gets visits, divides into chunks of one "night".
// Farms out to visit breakdown dropdown component.

import { computed } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import VisitsDailyBreakdown from "@/components/VisitsDailyBreakdown.vue";
import {
  visitsAreNocturnalOnlyAtLocation,
  visitsByDayAtLocation,
  visitsByNightAtLocation,
} from "@models/visitsUtils";
import type { LatLng } from "@typedefs/api/common";
import type { DateTime } from "luxon";

const emit = defineEmits<{
  (e: "selectedVisit", visit: ApiVisitResponse): void;
}>();

// eslint-disable-next-line vue/no-setup-props-destructure
const { visits, location } = defineProps<{
  visits: ApiVisitResponse[];
  location: LatLng;
}>();

const isNocturnal = computed<boolean>(() =>
  visitsAreNocturnalOnlyAtLocation(visits, location)
);

const visitsByChunk = computed<[DateTime, ApiVisitResponse[]][]>(() => {
  if (isNocturnal.value) {
    return visitsByNightAtLocation(visits, location).reverse();
  } else {
    return visitsByDayAtLocation(visits, location).reverse();
  }
});
const hasVisits = computed<boolean>(() => visits.length !== 0);
</script>
<template>
  <div :class="[{ 'ps-md-3': hasVisits }]">
    <visits-daily-breakdown
      v-for="([startTime, visits], index) in visitsByChunk"
      :key="index"
      :start-time="startTime"
      :visits="visits"
      :is-nocturnal="isNocturnal"
      :location="location"
      @selectedVisit="(visit) => emit('selectedVisit', visit)"
    />
  </div>
</template>

<style scoped lang="less"></style>

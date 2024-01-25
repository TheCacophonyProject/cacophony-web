<script setup lang="ts">
// Gets visits, divides into chunks of one "night".
// Farms out to visit breakdown dropdown component.

import { computed, onMounted, ref } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { StationId as LocationId } from "@typedefs/api/common";
import VisitsDailyBreakdown from "@/components/VisitsDailyBreakdown.vue";
import {
  visitsAreNocturnalOnlyAtLocation,
  visitsByDayAtLocation,
  visitsByNightAtLocation,
} from "@models/visitsUtils";
import type { LatLng } from "@typedefs/api/common";
import type { DateTime } from "luxon";

const { visits, location } = defineProps<{
  visits: ApiVisitResponse[];
  location: LatLng;
  highlightedLocation: LocationId | null;
}>();
const emit = defineEmits<{
  (e: "selected-visit", payload: ApiVisitResponse): void;
  (e: "change-highlighted-location", payload: LocationId | null): void;
}>();

const isNocturnal = computed<boolean>(() =>
  visitsAreNocturnalOnlyAtLocation(visits, location)
);

const visitsByChunk = computed<[DateTime, ApiVisitResponse[]][]>(() => {
  if (isNocturnal.value) {
    return visitsByNightAtLocation(visits, location); //.reverse();
  } else {
    return visitsByDayAtLocation(visits, location); //.reverse();
  }
});
const hasVisits = computed<boolean>(() => visits.length !== 0);
</script>
<template>
  <div :class="[{ 'ps-md-3': hasVisits }]" class="visits-breakdown-list">
    <visits-daily-breakdown
      v-for="([startTime, visits], index) in visitsByChunk"
      :key="index"
      :start-time="startTime"
      :visits="visits"
      :is-nocturnal="isNocturnal"
      :location="location"
      :currently-highlighed-location="highlightedLocation"
      @selected-visit="(visit) => emit('selected-visit', visit)"
      @change-highlighted-location="
        (loc) => emit('change-highlighted-location', loc)
      "
    />
  </div>
</template>

<style scoped lang="less">
.visits-breakdown-list {
  @media screen and (min-width: 1200px) {
    width: 540px;
  }
}
</style>

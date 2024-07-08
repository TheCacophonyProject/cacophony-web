<script setup lang="ts">
// Gets visits, divides into chunks of one "night".
// Farms out to visit breakdown dropdown component.

import { computed } from "vue";
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

const props = withDefaults(
  defineProps<{
    visits: ApiVisitResponse[];
    location: LatLng;
    highlightedLocation: LocationId | null;
  }>(),
  { highlightedLocation: null }
);
const emit = defineEmits<{
  (e: "selected-visit", payload: ApiVisitResponse): void;
  (e: "change-highlighted-location", payload: LocationId | null): void;
}>();

const isNocturnal = computed<boolean>(() =>
  visitsAreNocturnalOnlyAtLocation(props.visits, props.location)
);

const visitsByChunk = computed<[DateTime, ApiVisitResponse[]][]>(() => {
  if (isNocturnal.value) {
    return visitsByNightAtLocation(props.visits, props.location); //.reverse();
  } else {
    return visitsByDayAtLocation(props.visits, props.location); //.reverse();
  }
});
const hasVisits = computed<boolean>(() => props.visits.length !== 0);
// :class="[{ 'ps-md-3': hasVisits }]"

// NOTE: If we only supply visits for half a night (from midnight for instance) the labelling is misleading, since it
//  will still say "Night of n-1 and n" even though we only supplied visits for n, and there may be missing visits for
//  n-1
</script>
<template>
  <div class="visits-breakdown-list">
    <visits-daily-breakdown
      v-for="([startTime, visits], index) in visitsByChunk"
      :key="index"
      :start-time="startTime"
      :visits="visits"
      :is-nocturnal="isNocturnal"
      :location="location"
      :currently-highlighed-location="highlightedLocation"
      @selected-visit="(visit: ApiVisitResponse) => emit('selected-visit', visit)"
      @change-highlighted-location="
        (loc: LocationId | null) => emit('change-highlighted-location', loc)
      "
    />
  </div>
</template>

<style scoped lang="less">
.visits-breakdown-list {
  // We want this in the context of Dashboard
  @media screen and (min-width: 1200px) {
    width: 540px;
  }
  //@media screen and (min-width: 992px) {
  //  width: 430px;
  //}
}
</style>

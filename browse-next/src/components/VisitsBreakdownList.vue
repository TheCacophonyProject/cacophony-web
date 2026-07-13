<script setup lang="ts">
// Gets visits, divides into chunks of one "night".
// Farms out to visit breakdown dropdown component.

import { computed } from "vue";
import type { StationId as LocationId } from "@typedefs/api/common";
import VisitsDailyBreakdown from "@/components/VisitsDailyBreakdown.vue";
import {
  visitsAreNocturnalOnlyAtLocation,
  visitsByDayAtLocation,
  visitsByNightAtLocation,
} from "@models/visitsUtils";
import type { LatLng } from "@typedefs/api/common";
import type { DateTime } from "luxon";
import type { ApiStaticVisitResponse } from "@typedefs/api/visit";

const props = withDefaults(
  defineProps<{
    visits: ApiStaticVisitResponse[];
    location: LatLng;
    highlightedLocation: LocationId | null;
  }>(),
  { highlightedLocation: null },
);
const emit = defineEmits<{
  (e: "selected-visit", payload: ApiStaticVisitResponse): void;
  (e: "change-highlighted-location", payload: LocationId | null): void;
}>();

const isNocturnal = computed<boolean>(() =>
  visitsAreNocturnalOnlyAtLocation(props.visits, props.location),
);

const visitsByChunk = computed<[DateTime, ApiStaticVisitResponse[]][]>(() => {
  if (isNocturnal.value) {
    return visitsByNightAtLocation(props.visits, props.location); //.reverse();
  }
  return visitsByDayAtLocation(props.visits, props.location); //.reverse();
});
// :class="[{ 'ps-md-3': hasVisits }]"

// NOTE: If we only supply visits for half a night (from midnight for instance) the labelling is misleading, since it
//  will still say "Night of n-1 and n" even though we only supplied visits for n, and there may be missing visits for
//  n-1
</script>
<template>
  <div class="visits-breakdown-list">
    <visits-daily-breakdown
      v-for="([startTime, visits], index) in visitsByChunk"
      :key="`${startTime.toISO()}_${index}`"
      :start-time="startTime"
      :visits="visits"
      :data-cy="`visit group ${index}`"
      :is-nocturnal="isNocturnal"
      :location="location"
      :currently-highlighed-location="highlightedLocation"
      @selected-visit="
        (visit: ApiStaticVisitResponse) => emit('selected-visit', visit)
      "
      @change-highlighted-location="
        (loc: LocationId | null) => emit('change-highlighted-location', loc)
      "
    />
  </div>
</template>

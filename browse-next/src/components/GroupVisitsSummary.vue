<script setup lang="ts">
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@/components/MapWithPoints.vue";
import { computed, defineProps, onMounted, ref } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { ApiStationResponse } from "@typedefs/api/station";
import type { LatLng } from "leaflet";

// eslint-disable-next-line vue/no-setup-props-destructure
const { stations, visits, activeStations, startDate } = defineProps<{
  visits: ApiVisitResponse[];
  stations: ApiStationResponse[] | null;
  activeStations: ApiStationResponse[] | null;
  startDate: Date;
}>();

const highlightedPoint = ref<NamedPoint | null>(null);

const highlightPoint = (p: NamedPoint | null) => {
  highlightedPoint.value = p;
};
const stationsForMap = computed<NamedPoint[]>(() => {
  if (stations) {
    return stations.map(({ name, groupName, location }) => ({
      name,
      group: groupName,
      location: location as LatLng,
    }));
  }
  return [];
});
const activeStationsForMap = computed<NamedPoint[]>(() => {
  if (activeStations) {
    return activeStations.map(({ name, groupName, location }) => ({
      name,
      group: groupName,
      location: location as LatLng,
    }));
  }
  return [];
});

// TODO - De-dupe
// NOTE: Sorting precedence for visit tags displayed as small summary icons
const tagPrecedence = [
  "conflicting tags",
  "unidentified",
  "none",
  "mustelid",
  "cat",
  "possum",
  "hedgehog",
  "rodent",
  "leporidae",
];

// TODO - from startDate, work out the day buckets, then position the visits on them.
const dates = computed<Date[]>(() => {
  const now = new Date();
  let start = new Date(startDate);
  let d = [start];
  while (start < now) {
    start = new Date(start.setDate(start.getDate() + 1));
    d.push(start);
  }
  d = d.filter((date) => date < now);
  return d;
});

const visitsBySpecies = computed<[string, ApiVisitResponse[]][]>(() => {
  const summary = visits.reduce(
    (
      acc: Record<string, ApiVisitResponse[]>,
      currentValue: ApiVisitResponse
    ) => {
      if (currentValue.classification) {
        acc[currentValue.classification] =
          acc[currentValue.classification] || [];
        acc[currentValue.classification].push(currentValue);
      }
      return acc;
    },
    {}
  );
  // NOTE: Order by "badness" of predator
  return Object.entries(summary).sort(
    (a: [string, ApiVisitResponse[]], b: [string, ApiVisitResponse[]]) => {
      const aPriority = tagPrecedence.indexOf(a[0]);
      const bPriority = tagPrecedence.indexOf(b[0]);
      if (aPriority === -1 && bPriority > -1) {
        return 1;
      } else if (bPriority === -1 && aPriority > -1) {
        return -1;
      } else if (aPriority === -1 && bPriority === -1) {
        if (a[0] === b[0]) {
          return 0;
        }
        return a[0] > b[0] ? 1 : -1;
      }
      return aPriority - bPriority;
    }
  );
});
</script>
<template>
  <div style="background: #ccc; height: 500px">
    <map-with-points
      :points="stationsForMap"
      :active-points="activeStationsForMap"
      :highlighted-point="() => highlightedPoint"
      @hover-point="highlightPoint"
      @leave-point="highlightPoint"
      :radius="30"
      :is-interactive="false"
      :zoom="false"
      :can-change-base-map="false"
    />
    <div>
      <div
        v-for="([species, visits], index) in visitsBySpecies"
        :key="index"
        class="d-flex"
      >
        <div>{{ species }}</div>
        <div class="d-flex">
          <div>
            <div v-for="date in dates" :key="date.getTime()">
              {{ date.getDate() }}
            </div>
          </div>
          <div>
            // TODO - offset of visit in date, // mouse over events for visit
            item, click to see recordings?
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.map {
  height: 300px;
}
</style>

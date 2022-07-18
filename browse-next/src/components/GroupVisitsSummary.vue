<script setup lang="ts">
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@/components/MapWithPoints.vue";
import { computed, ref } from "vue";
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
  let d = [new Date(startDate)];

  // NOTE: This should go from the beginning of day 0 to the end of day x.
  while (d[d.length - 1] < now) {
    const prevDate = new Date(d[d.length - 1]);
    d.push(new Date(prevDate.setUTCDate(prevDate.getUTCDate() + 1)));
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

const getLeft = (minTime: number, time: number, maxTime: number) => {
  return ((time - minTime) / (maxTime - minTime)) * 100;
};

const getRight = (minTime: number, time: number, maxTime: number) => {
  return (1 - (time - minTime) / (maxTime - minTime)) * 100;
};

const minTime = computed<number>(() => {
  if (dates.value.length) {
    const minDate = new Date(dates.value[0]);
    minDate.setUTCHours(0, 0, 0, 0);
    return minDate.getTime();
  }
  return 0;
});


// FIXME - These things should be shown in the timezone of the devices/stations that made the recordings.
//  Get the timezone from the latlng of the station.
const maxTime = computed<number>(() => {
  if (dates.value.length) {
    const maxDate = new Date(dates.value[dates.value.length - 1]);
    maxDate.setUTCHours(23, 59, 59, 999);
    return maxDate.getTime();
  }
  return 0;
});
</script>
<template>
  <div style="background: #ccc">
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
        <div style="min-width: 100px">
          <span class="p-1">{{ species }}</span>
        </div>
        <div class="flex-fill d-flex justify-content-center position-relative">
          <div
            v-for="date in dates"
            :key="date.getTime()"
            :title="date.toISOString()"
            :style="{ left: `${getLeft(minTime, date.getTime(), maxTime)}%` }"
            class="event-item position-absolute"
          />
          <div
            v-for="visit in visits"
            :key="visit.timeStart"
            :title="visit.timeStart"
            :style="{
              left: `${getLeft(
                minTime,
                new Date(visit.timeStart).getTime(),
                maxTime
              )}%`,
              right: `${getRight(
                minTime,
                new Date(visit.timeEnd).getTime(),
                maxTime
              )}%`,
            }"
            :class="['event-item-visit', visit.classification]"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.map {
  height: 300px;
}
.event-item-visit {
  min-width: 5px;
  background: rgba(100, 100, 100, 0.3);
  position: absolute;
  bottom: 2px;
  top: 2px;

  &.mustelid {
    background: rgba(255, 0, 0, 0.3);
  }
  &.possum,
  &.cat {
    background: rgba(181, 51, 38, 0.3);
  }
  &.rodent,
  &.hedgehog {
    background: rgba(255, 127, 80, 0.3);
  }
}
</style>

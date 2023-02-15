<script setup lang="ts">
import MapWithPoints from "@/components/MapWithPoints.vue";
import { computed, ref } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { ApiStationResponse } from "@typedefs/api/station";
import type { LatLng } from "leaflet";
import VisitsTimeline from "@/components/VisitsTimeline.vue";
import type { NamedPoint } from "@models/mapUtils";
import { currentlyHighlightedStation } from "@models/SelectionContext";
import { locationsAreEqual } from "@/utils";

const { stations, visits, activeStations, startDate, loading } = defineProps<{
  visits: ApiVisitResponse[];
  stations: ApiStationResponse[];
  activeStations: ApiStationResponse[];
  startDate: Date;
  loading: boolean;
}>();
const highlightedPointInternal = ref<NamedPoint | null>(null);
const highlightedPoint = computed<NamedPoint | null>(() => {
  if (
    stations &&
    (currentlyHighlightedStation.value || highlightedPointInternal.value)
  ) {
    let station: ApiStationResponse | undefined;
    if (currentlyHighlightedStation.value) {
      station = stations.find(
        ({ id }) => id === currentlyHighlightedStation.value
      );
    } else {
      station = stations.find(({ location }) =>
        locationsAreEqual(
          location,
          highlightedPointInternal.value?.location as LatLng
        )
      );
    }
    if (station) {
      return {
        name: station.name,
        group: station.groupName,
        location: station.location,
      };
    }
  }
  return null;
});

const highlightPoint = (p: NamedPoint | null) => {
  highlightedPointInternal.value = p;
};
const stationsForMap = computed<NamedPoint[]>(() => {
  return stations
    .filter(({ location }) => location.lng !== 0 && location.lat !== 0)
    .map(({ name, groupName, location }) => ({
      name,
      group: groupName,
      location: location as LatLng,
    }));
});
const activeStationsForMap = computed<NamedPoint[]>(() => {
  return activeStations.map(({ name, groupName, location }) => ({
    name,
    group: groupName,
    location: location as LatLng,
  }));
});
const hasVisits = computed<boolean>(() => {
  return !loading && visits.length !== 0;
});
</script>
<template>
  <div>
    <div class="map-and-timeline">
      <map-with-points
        :points="stationsForMap"
        :active-points="activeStationsForMap"
        :highlighted-point="highlightedPoint"
        @hover-point="highlightPoint"
        @leave-point="highlightPoint"
        :radius="30"
        :is-interactive="false"
        :zoom="false"
        :can-change-base-map="false"
        :loading="loading"
      />
      <visits-timeline
        v-if="hasVisits"
        :visits="visits"
        :stations="activeStationsForMap"
        :start-date="startDate"
      />
      <div v-else-if="!loading">
        There were no visits in the selected time period.
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.map {
  height: 300px;
}
.map-and-timeline {
  position: sticky;
  top: 15px;
}
</style>

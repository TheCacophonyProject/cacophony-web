<script setup lang="ts">
import MapWithPoints from "@/components/MapWithPoints.vue";
import { computed, ref } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { ApiStationResponse } from "@typedefs/api/station";
import type { LatLng } from "leaflet";
import VisitsTimeline from "@/components/VisitsTimeline.vue";
import type { NamedPoint } from "@models/mapUtils";

const { stations, visits, activeStations, startDate, loading } = defineProps<{
  visits: ApiVisitResponse[];
  stations: ApiStationResponse[];
  activeStations: ApiStationResponse[];
  startDate: Date;
  loading: boolean;
}>();

const highlightedPoint = ref<NamedPoint | null>(null);

const highlightPoint = (p: NamedPoint | null) => {
  highlightedPoint.value = p;
};
const stationsForMap = computed<NamedPoint[]>(() => {
  return stations.map(({ name, groupName, location }) => ({
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
        :highlighted-point="() => ref(highlightedPoint)"
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

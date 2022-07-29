<script setup lang="ts">
import MapWithPoints from "@/components/MapWithPoints.vue";
import { computed, ref } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { ApiStationResponse } from "@typedefs/api/station";
import type { LatLng } from "leaflet";
import VisitsTimeline from "@/components/VisitsTimeline.vue";
import type {NamedPoint} from "@models/mapUtils";

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
</script>
<template>
  <div>
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
    <visits-timeline
      :visits="visits"
      :stations="activeStationsForMap"
      :start-date="startDate"
    />
  </div>
</template>

<style scoped lang="less">
.map {
  height: 300px;
}
</style>

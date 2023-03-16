<script setup lang="ts">
import MapWithPoints from "@/components/MapWithPoints.vue";
import { computed, ref } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import type { LatLng } from "leaflet";
import VisitsTimeline from "@/components/VisitsTimeline.vue";
import type { NamedPoint } from "@models/mapUtils";
import { currentlyHighlightedLocation } from "@models/SelectionContext";
import { locationsAreEqual } from "@/utils";

const { locations, visits, activeLocations, startDate, loading } = defineProps<{
  visits: ApiVisitResponse[];
  locations: ApiLocationResponse[];
  activeLocations: ApiLocationResponse[];
  startDate: Date;
  loading: boolean;
}>();
const highlightedPointInternal = ref<NamedPoint | null>(null);
const highlightedPoint = computed<NamedPoint | null>(() => {
  if (
    locations &&
    (currentlyHighlightedLocation.value || highlightedPointInternal.value)
  ) {
    let location: ApiLocationResponse | undefined;
    if (currentlyHighlightedLocation.value) {
      location = locations.find(
        ({ id }) => id === currentlyHighlightedLocation.value
      );
    } else {
      location = locations.find(({ location }) =>
        locationsAreEqual(
          location,
          highlightedPointInternal.value?.location as LatLng
        )
      );
    }
    if (location) {
      return {
        name: location.name,
        project: location.groupName,
        location: location.location,
      };
    }
  }
  return null;
});

const highlightPoint = (p: NamedPoint | null) => {
  highlightedPointInternal.value = p;
};
const locationsForMap = computed<NamedPoint[]>(() => {
  return locations
    .filter(({ location }) => location.lng !== 0 && location.lat !== 0)
    .map(({ name, groupName, location }) => ({
      name,
      project: groupName,
      location: location as LatLng,
    }));
});
const activeLocationsForMap = computed<NamedPoint[]>(() => {
  return activeLocations.map(({ name, groupName, location }) => ({
    name,
    project: groupName,
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
        :points="locationsForMap"
        :active-points="activeLocationsForMap"
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
        :locations="activeLocationsForMap"
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

<script setup lang="ts">
import MapWithPoints from "@/components/MapWithPoints.vue";
import { computed, inject, ref } from "vue";
import type { Ref } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import type { LatLng } from "leaflet";
import VisitsTimeline from "@/components/VisitsTimeline.vue";
import type { NamedPoint } from "@models/mapUtils";
import { locationsAreEqual } from "@/utils";
import type { StationId as LocationId } from "@typedefs/api/common";

const currentlyHighlightedLocation = inject(
  "currentlyHighlightedLocation"
) as Ref<LocationId | null>;

const props = defineProps<{
  visits: ApiVisitResponse[];
  locations: ApiLocationResponse[];
  activeLocations: ApiLocationResponse[];
  startDate: Date;
  loading: boolean;
}>();
const highlightedPointInternal = ref<NamedPoint | null>(null);
const highlightedPoint = computed<NamedPoint | null>(() => {
  if (
    props.locations &&
    (currentlyHighlightedLocation.value || highlightedPointInternal.value)
  ) {
    let location: ApiLocationResponse | undefined;
    if (currentlyHighlightedLocation.value) {
      location = props.locations.find(
        ({ id }) => id === currentlyHighlightedLocation.value
      );
    } else {
      location = props.locations.find(({ location }) =>
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
  return props.locations
    .filter(({ location }) => location.lng !== 0 && location.lat !== 0)
    .map(({ name, groupName, location }) => ({
      name,
      project: groupName,
      location: location as LatLng,
    }));
});
const activeLocationsForMap = computed<NamedPoint[]>(() => {
  return props.activeLocations.map(({ name, groupName, location }) => ({
    name,
    project: groupName,
    location: location as LatLng,
  }));
});
const hasVisits = computed<boolean>(() => {
  return !props.loading && props.visits.length !== 0;
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

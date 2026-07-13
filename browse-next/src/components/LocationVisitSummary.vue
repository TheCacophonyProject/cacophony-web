<script lang="ts" setup>
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { computed, inject } from "vue";
import type { Ref } from "vue";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { LatLng } from "leaflet";
import { visitsByLocation, visitsCountBySpecies } from "@models/visitsUtils";
import type { NamedPoint } from "@models/mapUtils";
import { displayLabelForClassificationLabel } from "@api/classificationsUtils.ts";
import type { StationId as LocationId } from "@typedefs/api/common";
import type { ApiStaticVisitResponse } from "@typedefs/api/visit";

const currentlyHighlightedLocation = inject(
  "currentlyHighlightedLocation",
) as Ref<LocationId | null>;

const props = withDefaults(
  defineProps<{
    location: ApiLocationResponse;
    locations: ApiLocationResponse[] | null;
    activeLocations: ApiLocationResponse[];
    visits: ApiStaticVisitResponse[];
  }>(),
  { locations: null },
);

const visitsForLocation = computed<ApiStaticVisitResponse[]>(() => {
  return props.visits.filter((visit) => visit.locationId === props.location.id);
});

const visitCount = computed<number>(() => visitsForLocation.value.length);

const maxVisitsForAnySpeciesInAnyStation = computed<number>(() => {
  // The summary bars get scaled by this amount.
  let max = 0;
  for (const locationVisits of Object.values(visitsByLocation(props.visits))) {
    const visitsCount = visitsCountBySpecies(locationVisits);
    max = Math.max(...visitsCount.map(([_label, _path, count]) => count), max);
  }
  return max;
});

// TODO - We show the point of the station in the center at a specific zoom level, and then
// any other stations that might be close enough to be included within those bounds.
const locationsForMap = computed<NamedPoint[]>(() => {
  if (props.locations) {
    return props.locations.map(({ name, groupName, location }) => ({
      name,
      project: groupName,
      location: location as LatLng,
    }));
  }
  return [];
});
const activeLocationsForMap = computed<NamedPoint[]>(() => {
  if (props.activeLocations) {
    return props.activeLocations.map(({ name, groupName, location }) => ({
      name,
      project: groupName,
      location: location as LatLng,
    }));
  }
  return [];
});
const thisLocationPoint = computed<NamedPoint>(() => ({
  name: props.location.name,
  project: props.location.groupName,
  location: props.location.location as LatLng,
}));

const speciesSummary = computed<[string, string, number][]>(() =>
  visitsCountBySpecies(visitsForLocation.value),
);

const highlightedPoint = computed<NamedPoint | null>(() => {
  if (props.locations && currentlyHighlightedLocation.value) {
    const location = props.locations.find(
      ({ id }) => id === currentlyHighlightedLocation.value,
    );
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
</script>

<template>
  <div class="location-visit-summary mb-3 mb-sm-0" v-if="visitCount !== 0">
    <div class="map-container">
      <map-with-points
        :highlighted-point="highlightedPoint"
        :points="locationsForMap"
        :active-points="activeLocationsForMap"
        :center-on-highlighted="true"
        :is-interactive="false"
        :zoom="false"
        :can-change-base-map="false"
        :has-attribution="false"
        :markers-are-interactive="false"
        :focused-point="thisLocationPoint"
      >
      </map-with-points>
      <div class="overlay me-1">
        <div class="station-name h5 lh-base mb-1">
          {{ location.name }}
        </div>
        <div class="visit-count lh-base text-muted">
          {{ visitCount }} visits
        </div>
      </div>
    </div>
    <div class="visit-species-breakdown d-flex justify-content-between gap-3">
      <div class="names">
        <div
          v-for="([species, _path, count], index) in speciesSummary"
          :class="['species-count']"
          :key="index"
        >
          <strong class="me-1 text-capitalize">{{ count }}</strong
          ><span class="text-capitalize d-inline-block">{{
            displayLabelForClassificationLabel(species)
          }}</span>
        </div>
      </div>
      <div class="values flex-fill">
        <div
          v-for="([species, path, count], index) in speciesSummary"
          :class="[species, 'species-value', ...path.split('.')]"
          :style="{
            width: `calc(max(5px, ${
              (count / maxVisitsForAnySpeciesInAnyStation) * 100
            }%))`,
          }"
          :key="index"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
@import "../assets/less/typography.less";
@import "../assets/less/elevation.less";

.location-visit-summary {
  background: var(--bs-white);
  border-radius: var(--bs-border-radius);
  width: calc(var(--cp-grid-base) * 75); // 300px
  min-width: calc(var(--cp-grid-base) * 75); // 300px
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
  margin-bottom: 2px;
  cursor: pointer;
  user-select: none;
  text-decoration: none;
  color: inherit;
  .standard-shadow();
}
.visit-species-breakdown {
  padding: var(--cp-spacing-sm);
  .species-count {
    height: 24px;
    line-height: 24px;
    font-size: var(--cp-font-size-sm);
  }
  .species-value {
    position: relative;
    height: 24px;

    &::before {
      position: absolute;
      content: " ";
      display: block;
      height: 6px;
      background: var(--cp-tag-no-priority);
      top: 9px;
      width: 100%;
      border-radius: var(--bs-border-radius-sm);
    }
    &.mustelid {
      &::before {
        background: var(--cp-tag-priority-1);
      }
    }
    &.possum,
    &.cat {
      &::before {
        background: var(--cp-tag-priority-2);
      }
    }
    &.rodent,
    &.hedgehog {
      &::before {
        background: var(--cp-tag-priority-3);
      }
    }
  }
}
.map-container {
  position: relative;
  // TODO - For proper z-indexing, we need to add these html labels as leaflet controls...
  .map {
    height: calc(var(--cp-grid-base) * 40); // 160px
    border-radius: var(--bs-border-radius) var(--bs-border-radius) 0 0;
  }
  .overlay {
    position: absolute;
    top: var(--cp-spacing-xs);
    left: var(--cp-spacing-xs);
    z-index: 400;
  }
  .station-name,
  .visit-count {
    background: var(--bs-white);
    border-radius: var(--bs-border-radius-sm);
    padding: var(--cp-spacing-xxxs) var(--cp-spacing-xs);
  }
  .station-name {
    font-weight: var(--cp-font-weight-medium);
    //color: var(--cp-color-green-700);
  }
  .visit-count {
    display: inline-block;
  }
}
</style>

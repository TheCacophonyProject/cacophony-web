<script lang="ts" setup>
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import { computed, inject } from "vue";
import type { Ref } from "vue";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { LatLng } from "leaflet";
import { visitsByLocation, visitsCountBySpecies } from "@models/visitsUtils";
import type { NamedPoint } from "@models/mapUtils";
import { displayLabelForClassificationLabel } from "@api/Classifications";
import type { StationId as LocationId } from "@typedefs/api/common";

const currentlyHighlightedLocation = inject(
  "currentlyHighlightedLocation",
) as Ref<LocationId | null>;

const props = withDefaults(
  defineProps<{
    location: ApiLocationResponse;
    locations: ApiLocationResponse[] | null;
    activeLocations: ApiLocationResponse[];
    visits: ApiVisitResponse[];
  }>(),
  { locations: null },
);

const visitsForLocation = computed<ApiVisitResponse[]>(() => {
  return props.visits.filter((visit) => visit.stationId === props.location.id);
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
        :center-on-highlighted="false"
        :is-interactive="false"
        :zoom="false"
        :can-change-base-map="false"
        :has-attribution="false"
        :markers-are-interactive="false"
        :focused-point="thisLocationPoint"
      >
      </map-with-points>
      <div class="overlay me-1">
        <div class="station-name mb-1 p-1 px-sm-1 py-sm-0">
          {{ location.name }}
        </div>
        <div class="visit-count p-1 px-sm-1 py-sm-0">
          {{ visitCount }} visits
        </div>
      </div>
    </div>
    <div class="visit-species-breakdown d-flex justify-content-between">
      <div class="names my-2">
        <div
          v-for="([species, _path, count], index) in speciesSummary"
          :class="['species-count', 'ps-1']"
          :key="index"
        >
          <strong class="me-1 text-capitalize">{{ count }}</strong
          ><span class="text-capitalize d-inline-block">{{
            displayLabelForClassificationLabel(species)
          }}</span>
        </div>
      </div>
      <div class="values flex-fill px-2 my-2">
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
@import "../assets/font-sizes.less";

.map {
  height: 150px;
}
.location-visit-summary {
  background: white;
  border-radius: 2px;
  width: 300px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
  margin-bottom: 2px;
  min-width: 295px;
  @media screen and (min-width: 576px) {
    &:not(:first-child) {
      margin-left: 19px;
    }
  }

  cursor: pointer;
  user-select: none;
  text-decoration: none;
  color: inherit;
  transition: background-color 0.2s ease-in-out;
  &:hover {
    background-color: #ececec;
    border-bottom: 4px solid #999;
  }
}
.visit-species-breakdown {
  .species-count {
    margin-left: 8px;
    height: 24px;
    line-height: 24px;
  }
  .names {
    .fs-7();
    @media screen and (min-width: 576px) {
      font-size: unset;
    }
  }
  .species-value {
    position: relative;
    height: 24px;

    &::before {
      position: absolute;
      content: " ";
      display: block;
      height: 6px;
      background: #9d9d9d;
      top: 9px;
      width: 100%;
    }
    &.mustelid {
      &::before {
        background: red;
      }
    }
    &.possum,
    &.cat {
      &::before {
        background: #b53326;
      }
    }
    &.rodent,
    &.hedgehog {
      &::before {
        background: lighten(coral, 20%);
      }
    }
  }
}
.map-container {
  position: relative;
  // TODO - For proper z-indexing, we need to add these html labels as leaflet controls...
  .overlay {
    position: absolute;
    top: 8px;
    left: 7px;
    z-index: 400;
  }
  .station-name,
  .visit-count {
    background: white;
  }
  .station-name {
    display: block;
    color: #016e9d;
    font-weight: 500;
    .fs-7();
  }
  .visit-count {
    display: inline-block;
    .fs-7();
  }

  @media screen and (min-width: 576px) {
    .visit-count,
    .station-name {
      .fs-6();
      font-weight: unset;
    }
  }
}
</style>

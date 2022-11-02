<script lang="ts" setup>
import type { ApiStationResponse } from "@typedefs/api/station";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import { computed, ref } from "vue";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { LatLng } from "leaflet";
import { visitsByStation, visitsCountBySpecies } from "@models/visitsUtils";
import type { NamedPoint } from "@models/mapUtils";
import { displayLabelForClassificationLabel } from "@api/Classifications";

const { station, stations, visits, activeStations } = defineProps<{
  station: ApiStationResponse;
  stations: ApiStationResponse[] | null;
  activeStations: ApiStationResponse[];
  visits: ApiVisitResponse[];
}>();

const visitsForStation = computed<ApiVisitResponse[]>(() => {
  return visits.filter((visit) => visit.stationId === station.id);
});

const visitCount = computed<number>(() => visitsForStation.value.length);

const maxVisitsForAnySpeciesInAnyStation = computed<number>(() => {
  // The summary bars get scaled by this amount.
  let max = 0;
  for (const stationVisits of Object.values(visitsByStation(visits))) {
    const visitsCount = visitsCountBySpecies(stationVisits);
    max = Math.max(...visitsCount.map(([_, count]) => count), max);
  }
  return max;
});

// TODO - We show the point of the station in the center at a specific zoom level, and then
// any other stations that might be close enough to be included within those bounds.
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
const thisStationPoint = {
  name: station.name,
  group: station.groupName,
  location: station.location as LatLng,
};

const speciesSummary = computed<[string, number][]>(() =>
  visitsCountBySpecies(visitsForStation.value)
);
</script>

<template>
  <div class="station-visit-summary mb-3 mb-sm-0">
    <div class="map-container">
      <map-with-points
        :highlighted-point="() => ref(null)"
        :points="stationsForMap"
        :active-points="activeStationsForMap"
        :is-interactive="false"
        :zoom="false"
        :can-change-base-map="false"
        :has-attribution="false"
        :markers-are-interactive="false"
        :focused-point="thisStationPoint"
      >
      </map-with-points>
      <div class="overlay me-1">
        <div class="station-name mb-1 p-1 px-sm-1 py-sm-0">
          {{ station.name }}
        </div>
        <div class="visit-count p-1 px-sm-1 py-sm-0">
          {{ visitCount }} visits
        </div>
      </div>
    </div>
    <div class="visit-species-breakdown d-flex justify-content-between">
      <div class="names my-2">
        <div
          v-for="([species, count], index) in speciesSummary"
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
          v-for="([species, count], index) in speciesSummary"
          :class="[species, 'species-value']"
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
.station-visit-summary {
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

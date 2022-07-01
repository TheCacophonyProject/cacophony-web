<script lang="ts" setup>
import type { ApiStationResponse } from "@typedefs/api/station";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import { computed, ref } from "vue";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@/components/MapWithPoints.vue";
import type { LatLng } from "leaflet";

// eslint-disable-next-line vue/no-setup-props-destructure
const { station, stations, visits } = defineProps<{
  station: ApiStationResponse;
  stations: ApiStationResponse[];
  visits: ApiVisitResponse[];
}>();

const visitsForStation = computed<ApiVisitResponse[]>(() => {
  return visits.filter((visit) => visit.stationId === station.id);
});

const visitCount = computed<number>(() => visitsForStation.value.length);

const maxVisitsForAnySpeciesInAnyStation = computed<number>(() => {
  // The summary bars get scaled by this amount.
  let max = 0;
  // Get visits by station:
  const visitsByStation: Record<number, ApiVisitResponse[]> = visits.reduce(
    (acc, visit) => {
      acc[visit.stationId] = acc[visit.stationId] || [];
      acc[visit.stationId].push(visit);
      return acc;
    },
    {} as Record<number, ApiVisitResponse[]>
  );
  for (const stationVisits of Object.values(visitsByStation)) {
    const visitsBySpecies: Record<string, number> = stationVisits.reduce(
      (acc: Record<string, number>, visit: ApiVisitResponse) => {
        if (visit.classification) {
          acc[visit.classification] = acc[visit.classification] || 0;
          acc[visit.classification]++;
        }
        return acc;
      },
      {} as Record<string, number>
    );
    max = Math.max(...Object.values(visitsBySpecies), max);
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
const nullPoint = ref(null);

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

const speciesSummary = computed<Record<string, number>>(() => {
  const summary = visitsForStation.value.reduce(
    (acc: Record<string, number>, currentValue: ApiVisitResponse) => {
      if (currentValue.classification) {
        acc[currentValue.classification] =
          acc[currentValue.classification] || 0;
        acc[currentValue.classification]++;
      }
      return acc;
    },
    {}
  );
  // NOTE: Order by "badness" of predator
  return Object.entries(summary).sort(
    (a: [string, number], b: [string, number]) => {
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
  <div class="station-visit-summary card">
    <div class="map-container">
      <map-with-points
        :highlighted-point="() => nullPoint"
        :points="stationsForMap"
        :is-interactive="false"
        :zoom="false"
        :can-change-base-map="false"
        :has-attribution="false"
        :markers-are-interactive="false"
      >
      </map-with-points>
      <div class="overlay me-1">
        <div class="station-name mb-1 px-1 fs-6">{{ station.name }}</div>
        <div class="visit-count px-1 fs-6">{{ visitCount }} visits</div>
      </div>
    </div>
    <div class="visit-species-breakdown d-flex justify-content-between">
      <div class="names my-2">
        <div
          v-for="([species, _], index) in speciesSummary"
          :class="['species-count', 'ps-1']"
          :key="index"
        >
          {{ species }}
        </div>
      </div>
      <div class="values flex-fill px-2 my-2">
        <div
          v-for="([species, count], index) in speciesSummary"
          :class="[species, 'species-value']"
          :style="{width: `calc(max(5px, ${(count / maxVisitsForAnySpeciesInAnyStation) * 100}%))`}"
          :key="index"
        >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.map {
  height: 150px;
}
.station-visit-summary {
  width: 300px;
  &:not(:first-child) {
    margin-left: 19px;
  }
}
.visit-species-breakdown {
  .species-count {
    margin-left: 8px;
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
  }
  .visit-count {
    display: inline-block;
  }
}
</style>

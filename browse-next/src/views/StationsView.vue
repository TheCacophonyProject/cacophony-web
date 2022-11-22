<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, onMounted, ref } from "vue";
import type { ApiStationResponse } from "@typedefs/api/station";
import { getStationsForGroup } from "@api/Group";
import { currentSelectedGroup } from "@models/LoggedInUser";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { LatLng } from "leaflet";
import type { NamedPoint } from "@models/mapUtils";
import SimpleTable from "@/components/SimpleTable.vue";
import type {
  CardTableItems,
  TableCellValue,
} from "@/components/CardTableTypes";

const stations = ref<ApiStationResponse[]>([]);
const loadingStations = ref(false);

onMounted(async () => {
  loadingStations.value = true;
  if (currentSelectedGroup.value) {
    const stationsResponse = await getStationsForGroup(
      currentSelectedGroup.value.id.toString(),
      true
    );
    if (stationsResponse.success) {
      stations.value = stationsResponse.result.stations;
    }
  }
  loadingStations.value = false;
});

const stationsForMap = computed<NamedPoint[]>(() => {
  // return [
  //   {
  //     name: "test",
  //     group: "test group",
  //     location: { lat: -43.80795, lng: 172.36845 } as LatLng,
  //   },
  //   {
  //     name: "test2",
  //     group: "test group",
  //     location: { lat: -43.80856, lng: 172.36323 } as LatLng,
  //   },
  // ];
  return stations.value.map(({ name, groupName, location }) => ({
    name,
    group: groupName,
    location: location as LatLng,
  }));
});
//  Display in table and on map.
const highlightedPoint = ref<NamedPoint | null>(null);

// TODO: Add an alert bell next to stations that have alerts for me.
// Also look at the ability for alerts for me to be at a blanket group level.
// Rename stations here.
// Delete stations here?

// Think about station images, but really, I think we want those to be at the device level, and be tracked
// in DeviceHistory.  Similarly to polygon masks

const highlightPoint = (p: NamedPoint | null) => {
  highlightedPoint.value = p;
};

const tableItems = computed<CardTableItems<string>>(() => {
  return stations.value
    .map((station: ApiStationResponse) => ({
      name: { value: station.name }, // Use device name with icon like we do currently?
    }))
    .reduce(
      (
        acc: CardTableItems<string>,
        item: Record<string, TableCellValue<string>>
      ) => {
        if (acc.headings.length === 0) {
          acc.headings = Object.keys(item);
        }
        acc.values.push(Object.values(item));
        return acc;
      },
      {
        headings: [],
        values: [],
      }
    );
});
</script>
<template>
  <div>
    <section-header>Stations</section-header>
    <div
      class="justify-content-center align-items-center d-flex flex-fill"
      v-if="loadingStations"
    >
      <h1 class="h3"><b-spinner /> Loading stations...</h1>
      <!--      TODO - Maybe use bootstrap 'placeholder' elements -->
    </div>
    <div
      class="d-flex flex-md-row flex-column-reverse justify-content-between"
      v-else
    >
      <div>
        <h6>Things that need to appear here:</h6>
        <ul>
          <li>
            Hovering table rows should be able to highlight points on the map
          </li>
          <li>Rename stations</li>
          <li>Show active vs inactive stations</li>
        </ul>

        <!--      <div class="px-3 p-md-0">-->
        <!--        <div-->
        <!--          v-for="p in stationsForMap"-->
        <!--          :key="p.name"-->
        <!--          @mouseover="highlightPoint(p)"-->
        <!--          @mouseout="highlightPoint(null)"-->
        <!--          @mouseleave="highlightPoint(null)"-->
        <!--        >-->
        <!--          {{ p.name }}-->
        <!--        </div>-->
        <!--      </div>-->
        <simple-table compact :items="tableItems" />
      </div>
      <map-with-points
        :points="stationsForMap"
        :active-points="[]"
        :highlighted-point="() => ref(highlightedPoint)"
        @hover-point="highlightPoint"
        @leave-point="highlightPoint"
        :radius="30"
      />
    </div>
  </div>
</template>
<style lang="less" scoped>
.map {
  //width: 100vh;
  height: 400px !important;
  position: unset;
  @media screen and (min-width: 768px) {
    position: absolute !important;
    right: 0;
    top: 0;
    height: 100vh !important;
    width: 500px !important;
  }
}
</style>

<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, onMounted, ref } from "vue";
import type { ApiStationResponse } from "@typedefs/api/station";
import { getStationsForGroup } from "@api/Group";
import { currentSelectedGroup } from "@models/LoggedInUser";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@/components/MapWithPoints.vue";

const stations = ref<ApiStationResponse[] | null>(null);
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
  if (stations.value) {
    return [
      {
        name: "test",
        group: "test group",
        location: { lat: -43.80795, lng: 172.36845 },
      },
      {
        name: "test2",
        group: "test group",
        location: { lat: -43.80856, lng:	172.36323 },
      }
    ];
    // return stations.value.map(({ name, groupName, location }) => ({
    //   name,
    //   group: groupName,
    //   location,
    // }));
  }
  return [];
});
// TODO - load stations for group.
//  Display in table and on map.
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
      <div class="px-3 p-md-0">stations list table</div>
      <map-with-points class="map" :points="stationsForMap" :radius="30" />
    </div>
  </div>
</template>
<style lang="less">
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

<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, onMounted, ref } from "vue";
import type { ApiStationResponse } from "@typedefs/api/station";
import { getStationsForGroup } from "@api/Group";
import { currentSelectedGroup } from "@models/LoggedInUser";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { LatLng } from "leaflet";
import type { NamedPoint } from "@models/mapUtils";
import { lastActiveStationTime, locationsAreEqual } from "@/utils";
import StationsOverviewTable from "@/components/StationsOverviewTable.vue";

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
  return stations.value
    .filter(({ location }) => location.lng !== 0 && location.lat !== 0)
    .map(({ name, groupName, location }) => ({
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

const sortLastActive = (a: ApiStationResponse, b: ApiStationResponse) => {
  const aa = lastActiveStationTime(a);
  const bb = lastActiveStationTime(b);
  if (aa && bb) {
    return bb.getTime() - aa.getTime();
  } else if (aa) {
    return 1;
  } else if (bb) {
    return -1;
  }
  return 0;
};
const stationsActiveBetween = (
  stations: ApiStationResponse[],
  fromTime: Date,
  untilTime: Date
): ApiStationResponse[] => {
  return stations
    .filter((station) => {
      if (station.retiredAt) {
        return false;
      }
      const lastActiveAt = lastActiveStationTime(station);
      return (
        !!lastActiveAt && lastActiveAt < untilTime && lastActiveAt > fromTime
      );
    })
    .sort(sortLastActive);
};

const stationsActiveInLastWeek = computed<ApiStationResponse[]>(() => {
  const now = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  return stationsActiveBetween(stations.value, oneWeekAgo, now);
});

const stationsActiveInLastMonth = computed<ApiStationResponse[]>(() => {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  return stationsActiveBetween(stations.value, oneMonthAgo, oneWeekAgo);
});

const stationsActiveInLastYear = computed<ApiStationResponse[]>(() => {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return stationsActiveBetween(stations.value, oneYearAgo, oneMonthAgo);
});

const stationsNotActiveInLastYear = computed<ApiStationResponse[]>(() => {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const twentyTen = new Date();
  twentyTen.setFullYear(2010);
  return stationsActiveBetween(stations.value, twentyTen, oneYearAgo);
});

const retiredStations = computed<ApiStationResponse[]>(() => {
  return stations.value
    .filter((station) => !!station.retiredAt)
    .sort(sortLastActive);
});

const enteredTableItem = ({
  name,
  groupName,
  location,
}: ApiStationResponse) => {
  highlightPoint({
    name,
    group: groupName,
    location,
  });
};

const leftTableItem = (_station: ApiStationResponse) => {
  highlightPoint(null);
};

const stationForHighlightedPoint = computed<ApiStationResponse | null>(() => {
  if (highlightedPoint.value) {
    return (
      stations.value.find(({ location }) =>
        locationsAreEqual(location, highlightedPoint.value?.location as LatLng)
      ) || null
    );
  }
  return null;
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
        <!--        <h6>Things that need to appear here:</h6>-->
        <!--        <ul>-->
        <!--          <li>-->
        <!--            Hovering table rows should be able to highlight points on the map-->
        <!--          </li>-->
        <!--          <li>Rename stations</li>-->
        <!--          <li>Show active vs inactive stations</li>-->
        <!--        </ul>-->
        <!--        TODO: Split into: stations active in the last week, last month, last year, older, retired -->
        <h6 v-if="stationsActiveInLastWeek.length">Active in past week</h6>
        <stations-overview-table
          v-if="stationsActiveInLastWeek.length"
          :stations="stationsActiveInLastWeek"
          :highlighted-item="stationForHighlightedPoint"
          @entered-item="enteredTableItem"
          @left-item="leftTableItem"
        />

        <h6 v-if="stationsActiveInLastMonth.length">Active in past month</h6>
        <stations-overview-table
          :stations="stationsActiveInLastMonth"
          :highlighted-item="stationForHighlightedPoint"
          @entered-item="enteredTableItem"
          @left-item="leftTableItem"
        />

        <h6 v-if="stationsActiveInLastYear.length">Active in past year</h6>
        <stations-overview-table
          v-if="stationsActiveInLastYear.length"
          :stations="stationsActiveInLastYear"
          :highlighted-item="stationForHighlightedPoint"
          @entered-item="enteredTableItem"
          @left-item="leftTableItem"
        />

        <h6 v-if="stationsNotActiveInLastYear.length">
          Not active in past year
        </h6>
        <stations-overview-table
          v-if="stationsNotActiveInLastYear.length"
          :stations="stationsNotActiveInLastYear"
          :highlighted-item="stationForHighlightedPoint"
          @entered-item="enteredTableItem"
          @left-item="leftTableItem"
        />
        <h6 v-if="retiredStations.length">Retired</h6>
        <stations-overview-table
          v-if="retiredStations.length"
          :stations="retiredStations"
          :highlighted-item="stationForHighlightedPoint"
          @entered-item="enteredTableItem"
          @left-item="leftTableItem"
        />
      </div>
      <map-with-points
        :points="stationsForMap"
        :active-points="stationsForMap"
        :highlighted-point="highlightedPoint"
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

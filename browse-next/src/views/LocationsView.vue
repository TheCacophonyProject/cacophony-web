<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, inject, onMounted, ref } from "vue";
import type { Ref } from "vue";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { getLocationsForProject } from "@api/Project";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { LatLng } from "leaflet";
import type { NamedPoint } from "@models/mapUtils";
import { lastActiveLocationTime, locationsAreEqual } from "@/utils";
import LocationsOverviewTable from "@/components/LocationsOverviewTable.vue";
import { currentSelectedProject } from "@models/provides";
import type { SelectedProject } from "@models/LoggedInUser";
import type { LoadedResource } from "@api/types";

const selectedProject = inject(currentSelectedProject) as Ref<SelectedProject>;
const locations = ref<LoadedResource<ApiLocationResponse[]>>(null);
const loadingLocations = ref(false);

onMounted(async () => {
  loadingLocations.value = true;
  if (selectedProject.value) {
    locations.value = await getLocationsForProject(
      selectedProject.value.id.toString(),
      true
    );
  }
  loadingLocations.value = false;
});

const locationsForMap = computed<NamedPoint[]>(() => {
  if (locations.value) {
    return (locations.value as ApiLocationResponse[])
      .filter(({ location }) => location.lng !== 0 && location.lat !== 0)
      .map(({ name, groupName, location }) => ({
        name,
        project: groupName,
        location: location as LatLng,
      }));
  }
  return [];
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

const sortLastActive = (a: ApiLocationResponse, b: ApiLocationResponse) => {
  const aa = lastActiveLocationTime(a);
  const bb = lastActiveLocationTime(b);
  if (aa && bb) {
    return bb.getTime() - aa.getTime();
  } else if (aa) {
    return 1;
  } else if (bb) {
    return -1;
  }
  return 0;
};
const locationsActiveBetween = (
  locations: LoadedResource<ApiLocationResponse[]>,
  fromTime: Date,
  untilTime: Date
): ApiLocationResponse[] => {
  if (locations) {
    return locations
      .filter((location) => {
        if (location.retiredAt) {
          return false;
        }
        const lastActiveAt = lastActiveLocationTime(location);
        console.log(lastActiveAt);
        return (
          !!lastActiveAt && lastActiveAt < untilTime && lastActiveAt > fromTime
        );
      })
      .sort(sortLastActive);
  }
  return [];
};

const locationsActiveInLastWeek = computed<ApiLocationResponse[]>(() => {
  const now = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  return locationsActiveBetween(locations.value, oneWeekAgo, now);
});

const locationsActiveInLastMonth = computed<ApiLocationResponse[]>(() => {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const lM = locationsActiveBetween(locations.value, oneMonthAgo, oneWeekAgo);
  console.log(lM, locations.value);
  return locationsActiveBetween(locations.value, oneMonthAgo, oneWeekAgo);
});

const locationsActiveInLastYear = computed<ApiLocationResponse[]>(() => {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return locationsActiveBetween(locations.value, oneYearAgo, oneMonthAgo);
});

const locationsNotActiveInLastYear = computed<ApiLocationResponse[]>(() => {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const twentyTen = new Date();
  twentyTen.setFullYear(2010);
  return locationsActiveBetween(locations.value, twentyTen, oneYearAgo);
});

const retiredLocations = computed<ApiLocationResponse[]>(() => {
  if (locations.value) {
    return (locations.value as ApiLocationResponse[])
      .filter((location) => !!location.retiredAt)
      .sort(sortLastActive);
  }
  return [];
});

const enteredTableItem = ({
  name,
  groupName,
  location,
}: ApiLocationResponse) => {
  highlightPoint({
    name,
    project: groupName,
    location,
  });
};

const leftTableItem = (_station: ApiLocationResponse) => {
  highlightPoint(null);
};

const locationForHighlightedPoint = computed<ApiLocationResponse | null>(() => {
  if (highlightedPoint.value) {
    return (
      (locations.value || []).find(({ location }) =>
        locationsAreEqual(location, highlightedPoint.value?.location as LatLng)
      ) || null
    );
  }
  return null;
});

const projectHasLocations = computed<boolean>(() => {
  return (
    locations.value && (locations.value as ApiLocationResponse[]).length !== 0
  );
});
</script>
<template>
  <div>
    <section-header>Locations</section-header>
    <div
      class="justify-content-center align-content-center d-flex flex-fill"
      v-if="loadingLocations"
    >
      <b-spinner size="xl" /> <span class="h3 ms-3">Loading locations...</span>
      <!--      TODO - Maybe use bootstrap 'placeholder' elements -->
    </div>
    <div
      class="d-flex flex-md-row flex-column-reverse justify-content-between"
      v-else
    >
      <div v-if="!projectHasLocations">
        There are no existing locations for this project
      </div>
      <div v-else>
        <!--        <h6>Things that need to appear here:</h6>-->
        <!--        <ul>-->
        <!--          <li>-->
        <!--            Hovering table rows should be able to highlight points on the map-->
        <!--          </li>-->
        <!--          <li>Rename stations</li>-->
        <!--          <li>Show active vs inactive stations</li>-->
        <!--        </ul>-->
        <!--        TODO: Split into: stations active in the last week, last month, last year, older, retired -->
        <h6 v-if="locationsActiveInLastWeek.length">Active in past week</h6>
        <locations-overview-table
          v-if="locationsActiveInLastWeek.length"
          :locations="locationsActiveInLastWeek"
          :highlighted-item="locationForHighlightedPoint"
          @entered-item="enteredTableItem"
          @left-item="leftTableItem"
        />

        <h6 v-if="locationsActiveInLastMonth.length">Active in past month</h6>
        <locations-overview-table
          v-if="locationsActiveInLastMonth.length"
          :locations="locationsActiveInLastMonth"
          :highlighted-item="locationForHighlightedPoint"
          @entered-item="enteredTableItem"
          @left-item="leftTableItem"
        />

        <h6 v-if="locationsActiveInLastYear.length">Active in past year</h6>
        <locations-overview-table
          v-if="locationsActiveInLastYear.length"
          :locations="locationsActiveInLastYear"
          :highlighted-item="locationForHighlightedPoint"
          @entered-item="enteredTableItem"
          @left-item="leftTableItem"
        />

        <h6 v-if="locationsNotActiveInLastYear.length">
          Not active in past year
        </h6>
        <locations-overview-table
          v-if="locationsNotActiveInLastYear.length"
          :locations="locationsNotActiveInLastYear"
          :highlighted-item="locationForHighlightedPoint"
          @entered-item="enteredTableItem"
          @left-item="leftTableItem"
        />
        <h6 v-if="retiredLocations.length">Retired</h6>
        <locations-overview-table
          v-if="retiredLocations.length"
          :locations="retiredLocations"
          :highlighted-item="locationForHighlightedPoint"
          @entered-item="enteredTableItem"
          @left-item="leftTableItem"
        />
      </div>
      <map-with-points
        v-if="projectHasLocations"
        :points="locationsForMap"
        :active-points="locationsForMap"
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

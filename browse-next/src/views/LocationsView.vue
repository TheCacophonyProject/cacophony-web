<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, inject, onMounted, ref } from "vue";
import type { Ref } from "vue";
import type { LatLng, StationId as LocationId } from "@typedefs/api/common";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@models/mapUtils";
import { lastActiveLocationTime, locationsAreEqual } from "@/utils";
import LocationsOverviewTable from "@/components/LocationsOverviewTable.vue";
import { currentSelectedProject } from "@models/provides";
import {
  LocationsForCurrentProject,
  type SelectedProject,
} from "@models/LoggedInUser";
import type { LoadedResource } from "@apiClient/types";
import { ClientApi } from "@/api";
import { useElementBounding, useWindowSize } from "@vueuse/core";
import { BPopover, BSpinner } from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import { latLngApproxDistance } from "@/helpers/Location.ts";

const selectedProject = inject(currentSelectedProject) as Ref<SelectedProject>;
const locations = ref<LoadedResource<ApiLocationResponse[]>>(null);
const loadingLocations = ref(false);

onMounted(async () => {
  loadingLocations.value = true;
  if (selectedProject.value) {
    await loadLocations();
  }
  loadingLocations.value = false;
});

const loadLocations = async () => {
  locations.value = await ClientApi.Projects.getLocationsForProject(
    selectedProject.value.id.toString(),
    true,
  );
};

const cacophonyHq = { lat: -43.5339514, lng: 172.6467213 };
const locIsInCacophonyHq = (location: LatLng): boolean => {
  return latLngApproxDistance(cacophonyHq, location) < 2000;
};

const projectIsAroundCacophonyHq = computed<boolean>(() => {
  // All locations are around cacophony hq
  if (validLocations.value) {
    return validLocations.value.every(
      ({ location }) => latLngApproxDistance(cacophonyHq, location) < 50000,
    );
  }
  return false;
});

const validLocations = computed(() => {
  if (!locations.value) {
    return [];
  }
  return (locations.value as ApiLocationResponse[]).filter((location) => {
    const {
      location: loc,
      lastThermalRecordingTime,
      lastAudioRecordingTime,
    } = location;
    return (
      loc.lng !== 0 &&
      loc.lat !== 0 &&
      (!!lastThermalRecordingTime || !!lastAudioRecordingTime)
    );
  });
});

const locationsForMap = computed<NamedPoint[]>(() => {
  if (locations.value) {
    return validLocations.value
      .filter(({ location }) =>
        projectIsAroundCacophonyHq.value ? true : !locIsInCacophonyHq(location),
      )
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
  untilTime: Date,
): ApiLocationResponse[] => {
  if (locations) {
    return locations
      .filter((location) => {
        if (location.retiredAt) {
          return false;
        }
        const lastActiveAt = lastActiveLocationTime(location);
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
        locationsAreEqual(location, highlightedPoint.value?.location as LatLng),
      ) || null
    );
  }
  return null;
});

const mapBuffer = ref<HTMLDivElement>();
const mapContainer = ref<HTMLDivElement>();
const locationsContainer = ref<HTMLDivElement>();
const { right: locationContainerRight } =
  useElementBounding(locationsContainer);
const projectHasLocations = computed<boolean>(() => {
  return (
    !!locations.value && (locations.value as ApiLocationResponse[]).length !== 0
  );
});

const { width: windowWidth } = useWindowSize();

const mapWidthPx = computed<number>(() => {
  if (mapBuffer.value === null) {
    return 0;
  }
  const mapBufferWidth = mapBuffer.value!.offsetWidth;
  if (windowWidth.value >= 992) {
    return mapBufferWidth;
  }
  return 0;
});

interface PopOverElement {
  show: () => void;
  hide: () => void;
}
const popOverHint = ref<PopOverElement>();
const renameHintParent = ref<HTMLSpanElement | null>(null);

const showRenameHint = (el: HTMLSpanElement) => {
  renameHintParent.value = el;
  (popOverHint.value as PopOverElement).show();
};
const hideRenameHint = () => {
  (popOverHint.value as PopOverElement).hide();
};

const updateLocationName = async (payload: {
  newName: string;
  id: LocationId;
}) => {
  const location = (locations.value || []).find(({ id }) => id === payload.id);
  if (location) {
    location.name = payload.newName;
    LocationsForCurrentProject.value =
      (await ClientApi.Projects.getLocationsForProject(
        selectedProject.value.id.toString(),
        true,
      )) as LoadedResource<ApiLocationResponse[]>;
  }
};
</script>
<template>
  <div class="d-flex flex-column flex-fill">
    <section-header>Locations</section-header>
    <b-popover
      ref="popOverHint"
      variant="secondary"
      noninteractive
      manual
      tooltip
      no-fade
      :delay="{ show: 0, hide: 0 }"
      @hidden="renameHintParent = null"
      custom-class="tag-info-popover"
      placement="auto"
      :target="renameHintParent"
    >
      This location was automatically named. Rename it to a meaningful name for
      your project.
    </b-popover>
    <div
      v-if="loadingLocations"
      class="d-flex align-items-center flex-column flex-fill"
    >
      <div class="d-flex align-items-center flex-fill">
        <b-spinner variant="secondary" />
      </div>
    </div>
    <div
      v-else
      class="d-flex flex-fill justify-content-between"
      ref="locationsContainer"
    >
      <div
        class="justify-content-center align-items-center d-flex flex-fill"
        v-if="loadingLocations"
      >
        <b-spinner size="xl" class="text-secondary" />
        <span class="h3 m-0 ms-3 text-secondary">Loading locations...</span>
        <!--      TODO - Maybe use bootstrap 'placeholder' elements -->
      </div>

      <div class="d-flex flex-column-reverse justify-content-between flex-fill">
        <div
          v-if="!projectHasLocations"
          class="d-flex flex-fill justify-content-center align-items-center"
        >
          <div
            class="no-results text-body-tertiary d-flex flex-column text-center col col-12 col-md-8 col-lg-6"
          >
            <material-symbol
              name="location_off"
              size="2.4rem"
              grade="thin"
              class="mb-2"
            />
            <h4 class="h5 mb-2">This project has no locations</h4>
            <p>
              Locations are automatically created from a device location.
              Locations will be displayed here when devices connect to the
              Monitoring Platform.
            </p>
          </div>
        </div>
        <div
          v-else
          class="col col-12 col-lg-8 col-xl-7 d-flex flex-fill flex-column me-md-3 mt-4 mt-lg-0"
        >
          <!--        <h6>Things that need to appear here:</h6>-->
          <!--        <ul>-->
          <!--          <li>-->
          <!--            Hovering table rows should be able to highlight points on the map-->
          <!--          </li>-->
          <!--          <li>Rename stations</li>-->
          <!--          <li>Show active vs inactive stations</li>-->
          <!--        </ul>-->
          <!--        TODO: Split into: stations active in the last week, last month, last year, older, retired -->
          <h3 v-if="locationsActiveInLastWeek.length" class="h4 mb-3">
            Active in past week
          </h3>
          <locations-overview-table
            v-if="locationsActiveInLastWeek.length"
            :locations="locationsActiveInLastWeek"
            :highlighted-item="locationForHighlightedPoint"
            @entered-item="enteredTableItem"
            @left-item="leftTableItem"
            @show-rename-hint="showRenameHint"
            @hide-rename-hint="hideRenameHint"
            @updated-location-name="updateLocationName"
            class="mb-4"
          />

          <h6 v-if="locationsActiveInLastMonth.length" class="h4 mb-3">
            Active in past month
          </h6>
          <locations-overview-table
            v-if="locationsActiveInLastMonth.length"
            :locations="locationsActiveInLastMonth"
            :highlighted-item="locationForHighlightedPoint"
            @entered-item="enteredTableItem"
            @left-item="leftTableItem"
            @show-rename-hint="showRenameHint"
            @hide-rename-hint="hideRenameHint"
            @updated-location-name="updateLocationName"
            class="mb-4"
          />

          <h6 v-if="locationsActiveInLastYear.length" class="h4 mb-3">
            Active in past year
          </h6>
          <locations-overview-table
            v-if="locationsActiveInLastYear.length"
            :locations="locationsActiveInLastYear"
            :highlighted-item="locationForHighlightedPoint"
            @entered-item="enteredTableItem"
            @left-item="leftTableItem"
            @show-rename-hint="showRenameHint"
            @hide-rename-hint="hideRenameHint"
            @updated-location-name="updateLocationName"
            class="mb-4"
          />

          <h6 v-if="locationsNotActiveInLastYear.length" class="h4 mb-3">
            Not active in past year
          </h6>
          <locations-overview-table
            v-if="locationsNotActiveInLastYear.length"
            :locations="locationsNotActiveInLastYear"
            :highlighted-item="locationForHighlightedPoint"
            @entered-item="enteredTableItem"
            @left-item="leftTableItem"
            @show-rename-hint="showRenameHint"
            @hide-rename-hint="hideRenameHint"
            @updated-location-name="updateLocationName"
            class="mb-4"
          />
          <h6 v-if="retiredLocations.length" class="h4 mb-3">Retired</h6>
          <locations-overview-table
            v-if="retiredLocations.length"
            :locations="retiredLocations"
            :highlighted-item="locationForHighlightedPoint"
            @entered-item="enteredTableItem"
            @left-item="leftTableItem"
            @show-rename-hint="showRenameHint"
            @hide-rename-hint="hideRenameHint"
            @updated-location-name="updateLocationName"
            class="mb-4"
          />
        </div>
        <div
          class="map-buffer col col-12 col-lg-4 col-xl-5"
          ref="mapBuffer"
        ></div>
        <map-with-points
          ref="mapContainer"
          v-if="projectHasLocations"
          :points="locationsForMap"
          :active-points="locationsForMap"
          :highlighted-point="highlightedPoint"
          @hover-point="highlightPoint"
          @leave-point="highlightPoint"
          :width="mapWidthPx"
          :radius="30"
        />
      </div>
    </div>
  </div>
</template>
<style lang="less" scoped>
@import "../assets/less/breakpoints";
@import "../assets/less/elevation";
.map {
  @media screen and (max-width: @breakpoint-md-max) {
    height: 40vh;
    max-height: calc(var(--cp-grid-base) * 100); // 400px
    border-radius: var(--bs-border-radius);
    .standard-shadow-inset();
    border: 1px solid var(--border-color-light);
  }
  @media screen and (min-width: @breakpoint-lg) {
    position: absolute !important;
    right: 0;
    top: 0;
    height: 100vh !important;
  }
}
</style>

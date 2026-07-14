<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import type { ComputedRef, Ref } from "vue";
import {
  computed,
  inject,
  onBeforeMount,
  onMounted,
  provide,
  ref,
  watch,
} from "vue";
import { ClientApi } from "@/api";
import type { SelectedProject } from "@models/LoggedInUser";
import {
  showUnimplementedModal,
  urlNormalisedCurrentProjectName,
} from "@models/LoggedInUser";
import HorizontalOverflowCarousel from "@/components/HorizontalOverflowCarousel.vue";
import InlineViewModal from "@/components/InlineViewModal.vue";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import ProjectVisitsSummary from "@/components/ProjectVisitsSummary.vue";
import LocationVisitSummary from "@/components/LocationVisitSummary.vue";
import VisitsBreakdownList from "@/components/VisitsBreakdownList.vue";
import { BButton, BSpinner } from "bootstrap-vue-next";
import type { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import { useRoute, useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import {
  displayLabelForClassificationLabel,
  flatClassifications,
  getClassifications,
} from "@api/classificationsUtils.ts";
import TagImage from "@/components/TagImage.vue";
import {
  activeLocations,
  currentSelectedProject as currentActiveProject,
  latLngForActiveLocations,
  userProjects,
} from "@models/provides";
import type { LoadedResource } from "@apiClient/types";
import {
  canonicalLatLngForLocations,
  latLngApproxDistance,
} from "@/helpers/Location";
import {
  sortTagPrecedence,
  visitClassificationLabel,
  visitClassificationLabelFromPath,
  visitClassificationPath,
} from "@models/visitsUtils";
import type {
  LatLng,
  RecordingId,
  StationId as LocationId,
} from "@typedefs/api/common";
import { DEFAULT_DASHBOARD_IGNORED_CAMERA_TAGS } from "@/consts.ts";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import { ActivitySearchDisplayMode } from "@/components/activitySearchUtils.ts";
import type { ApiStaticVisitResponse } from "@typedefs/api/visit";
import type { VisitsStaticQueryResult } from "@apiClient/Monitoring.ts";
import { recordingUpdatedInVisitsContext } from "@/helpers/patch-visits-context.ts";
import BimodalSwitch from "@/components/BimodalSwitch.vue";

const selectedVisit = ref<ApiStaticVisitResponse | null>(null);
const currentlyHighlightedLocation = ref<LocationId | null>(null);
const visitsContext = ref<ApiStaticVisitResponse[] | null>(null);
provide("currentlySelectedVisit", selectedVisit);
provide("currentlyHighlightedLocation", currentlyHighlightedLocation);

const currentVisitsFilter = ref<
  ((visit: ApiStaticVisitResponse) => boolean) | null
>(null);

const visitIsTombstoned = (visit: ApiStaticVisitResponse): boolean => {
  return visit.hasOwnProperty("tombstoned");
};

const pathForTag = (tag: string): string => {
  return flatClassifications.value[tag]?.path || tag;
};

const currentVisitsFilterComputed = computed<
  (visit: ApiStaticVisitResponse) => boolean
>(() => {
  if (currentVisitsFilter.value === null) {
    return (visit) => !visitorIsIgnored(visit) && !visitIsTombstoned(visit);
  } else {
    return (visit) =>
      (currentVisitsFilter.value as (visit: ApiStaticVisitResponse) => boolean)(
        visit,
      ) &&
      !visitIsTombstoned(visit) &&
      !visitorIsIgnored(visit);
  }
});

const dashboardVisits = computed<ApiStaticVisitResponse[]>(() => {
  return ((visitsContext.value || []) as ApiStaticVisitResponse[]).filter(
    (visit) => !visitorIsIgnored(visit) && !visitIsTombstoned(visit),
  );
});

// TODO: Move to provides/inject
// FIXME: Any time any visit is mutated (tags change etc, we have to recompute this,
//  which could be very slow for a large list?
const maybeFilteredVisitsContext = computed<ApiStaticVisitResponse[]>(() => {
  if (visitsContext.value) {
    return (visitsContext.value as ApiStaticVisitResponse[]).filter(
      currentVisitsFilterComputed.value,
    );
  }
  return [];
});

provide("visitsContext", maybeFilteredVisitsContext);

const ignoredTags = computed<string[]>(() => {
  if (currentProject.value) {
    return (
      currentProject.value.settings?.ignoredCameraDashboardTags ||
      DEFAULT_DASHBOARD_IGNORED_CAMERA_TAGS
    );
  }
  return DEFAULT_DASHBOARD_IGNORED_CAMERA_TAGS;
});

const visitorIsIgnored = (visit: ApiStaticVisitResponse): boolean => {
  const path = visitClassificationPath(visit);
  if (path === null) {
    return true;
  }
  if (path) {
    if (ignoredTags.value.includes(visitClassificationLabelFromPath(path))) {
      return true;
    }
    const parts = path.split(".");
    for (const part of parts) {
      if (ignoredTags.value.includes(part)) {
        return true;
      }
    }
  }
  return false;
};

const visitHasClassification =
  (tag: string) =>
  (visit: ApiStaticVisitResponse): boolean => {
    return (visitClassificationLabel(visit) === tag) as boolean;
  };

const visitHasLocation =
  (location: LocationId) =>
  (visit: ApiStaticVisitResponse): boolean => {
    return (visit && visit.locationId === location) as boolean;
  };

const recordingMode = ref<"Thermal" | "Audio">("Thermal");
const audioMode = computed<boolean>(() => recordingMode.value === "Audio");

const router = useRouter();
const route = useRoute();
const isMobileView = useMediaQuery("(max-width: 639px)");
const availableProjects = inject(userProjects) as Ref<
  LoadedResource<ApiProjectResponse[]>
>;
const currentProject = inject(currentActiveProject) as ComputedRef<
  SelectedProject | false
>;

// Two ways we can go about next/prev visit.  We pass the loaded visits through from the parent context,
// and then move through them as an array index.

// Otherwise, we pass the visit context/scope (group or a set of stations) to the recordings view,
// and when it reaches the end of the current visit set, it queries for prev/next visit using the visit start/end time, and the scope.
// Second option is more resilient to changes of classification, although if the classification changes, we also need to broadcast that
// to the parent list, and have that refresh...

watch(
  selectedVisit,
  async (
    visit: ApiStaticVisitResponse | null,
    prevVisit: ApiStaticVisitResponse | null,
  ) => {
    if (visit && !prevVisit) {
      // Set route so that modal shows up
      const classificationPath = visitClassificationPath(visit);
      const params: Record<string, string> = {
        visitLabel:
          visitClassificationLabelFromPath(classificationPath || "") || "none",
      };
      const recId =
        visit.humanClassificationRecordingId ||
        visit.aiClassificationRecordingId ||
        visit.recordingIds[0];
      const trackId =
        visit.humanClassificationTrackId || visit.aiClassificationTrackId;
      if (recId) {
        params.currentRecordingId = recId.toString();
      }
      if (trackId) {
        params.trackId = trackId.toString();
      }
      if (visit.recordingIds.length) {
        params.recordingIds = visit.recordingIds.join(",");
      }

      await router.push({
        name: "dashboard-visit",
        params,
        query: route.query,
      });
    } else if (!visit && prevVisit) {
      // We've stopped having a selected visit modal
      currentVisitsFilter.value = null;
    }
  },
);

watch(route, () => {
  loadedRouteName.value = "dashboard";
});

// Use provide to provide selected visit context to loaded modal.
// If url is saved and returned to, the best we can do is display the visit, but we can't do next/prev visits.

// TODO - Reload these from user preferences.
const timePeriodDays = ref<number>(7);
const visitsOrRecordings = ref<"visits" | "recordings">("visits");
const speciesOrLocations = ref<"species" | "location">("species");
const loadingVisitsProgress = ref<number>(0);

const fromTime = computed(() => {
  const from = new Date();
  from.setDate(from.getDate() - timePeriodDays.value);
  return from;
});

const locations = ref<LoadedResource<ApiLocationResponse[]>>(null);

const speciesSummary = computed<Record<string, number>>(() => {
  return dashboardVisits.value.reduce(
    (acc: Record<string, number>, currentValue: ApiStaticVisitResponse) => {
      const classification = visitClassificationLabel(currentValue);
      if (classification) {
        acc[classification] = acc[classification] || 0;
        acc[classification]++;
      }
      return acc;
    },
    {},
  );
});

const speciesSummarySorted = computed(() => {
  return Object.entries(speciesSummary.value).sort(
    ([a]: [string, number], [b]: [string, number]) => sortTagPrecedence(a, b),
  );
});

watch(speciesOrLocations, (next) => {
  if (next === "location") {
    showUnimplementedModal.value = true;
  }
});

watch(visitsOrRecordings, (next) => {
  if (next === "recordings") {
    showUnimplementedModal.value = true;
  }
});

const earliestDate = computed<Date>(() => {
  const now = new Date();
  return new Date(now.setUTCDate(now.getUTCDate() - timePeriodDays.value));
});

const loadVisits = async () => {
  if (currentProject.value) {
    visitsContext.value = null;
    visitsContext.value = await ClientApi.Visits.getAllVisitsForProject(
      (currentProject.value as SelectedProject).id,
      fromTime.value,
      new Date(),
      [],
      [],
      [],
      10000,
      (val: number) => {
        // TODO - Do we want to display loading progress via the UI?
        loadingVisitsProgress.value = val;
      },
    );
  }
};

const reloadDashboard = async (nextProject: SelectedProject | false) => {
  if (nextProject) {
    await Promise.all([loadLocations(), loadVisits()]);
  }
};

watch(timePeriodDays, loadVisits);
watch(currentProject, reloadDashboard);

const loadedRouteName = ref<string>("");
onBeforeMount(async () => {
  loadedRouteName.value = route.name as string;
  await getClassifications();
});

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
  if (locations.value) {
    return (locations.value as ApiLocationResponse[])
      .filter(({ location }) => location.lng !== 0 && location.lat !== 0)
      .filter((location) => {
        if (audioMode.value) {
          return (
            (location.lastActiveAudioTime &&
              new Date(location.lastActiveAudioTime) > earliestDate.value) ||
            (location.lastAudioRecordingTime &&
              new Date(location.lastAudioRecordingTime) > earliestDate.value)
          );
        } else {
          return (
            (location.lastActiveThermalTime &&
              new Date(location.lastActiveThermalTime) > earliestDate.value) ||
            (location.lastThermalRecordingTime &&
              new Date(location.lastThermalRecordingTime) > earliestDate.value)
          );
        }
      });
  }
  return [];
});

const locationsWithOnlineOrActiveDevicesInSelectedTimeWindow = computed<
  ApiLocationResponse[]
>(() => {
  // NOTE: - Use this to show which stations *could* have had recordings, but may have had no activity.
  // const visitLocations = dashboardVisits.value.map(
  //   (visit: ApiVisitResponse) => visit.stationId
  // );
  return validLocations.value.filter(({ location }) =>
    projectIsAroundCacophonyHq.value ? true : !locIsInCacophonyHq(location),
  );
});

provide(
  activeLocations,
  locationsWithOnlineOrActiveDevicesInSelectedTimeWindow,
);

const allLocations = computed<ApiLocationResponse[]>(() => {
  return (locations.value && (locations.value as ApiLocationResponse[])) || [];
});

const loadLocations = async () => {
  if (currentProject.value) {
    locations.value = null;
    locations.value = await ClientApi.Projects.getLocationsForProject(
      (currentProject.value as SelectedProject).id.toString(),
      true,
    );
  }
};

const canonicalLatLngForActiveLocations = canonicalLatLngForLocations(
  locationsWithOnlineOrActiveDevicesInSelectedTimeWindow,
);

// TODO - Maybe this should be some global context variable too.
provide(latLngForActiveLocations, canonicalLatLngForActiveLocations);

onMounted(async () => {
  if (currentProject.value) {
    performance.mark("Dashboard starts loading");
    await reloadDashboard(currentProject.value);
    performance.mark("Dashboard finishes loading");
  }
  // Load visits for time period.
  // Get species summary.
});

const isLoading = computed<boolean>(
  () => locations.value === null || visitsContext.value === null,
);

const currentSelectedProjectHasAudio = computed<boolean>(() => {
  return (
    !!currentProject.value && "lastAudioRecordingTime" in currentProject.value
  );
});

const currentSelectedProjectHasCameras = computed<boolean>(() => {
  return (
    !!currentProject.value && "lastThermalRecordingTime" in currentProject.value
  );
});

const currentSelectedProjectHasAudioAndThermal = computed<boolean>(() => {
  return (
    currentSelectedProjectHasAudio.value &&
    currentSelectedProjectHasCameras.value
  );
});

const _hasSelectedVisit = computed<boolean>({
  get: () =>
    (route.name as string).startsWith("dashboard-visit") ||
    (route.name as string).startsWith("dashboard-recording"),
  set: (value: boolean) => {
    if (!value) {
      // Return to dashboard from modal.
      router.push({
        name: "dashboard",
        params: { projectName: route.params.projectName },
      });
      selectedVisit.value = null;
    }
  },
});

const showVisitsForTag = (tag: string) => {
  // set the selected visit to the last visit with the tag,
  // and set the filter for the context to the tag.
  currentVisitsFilter.value = visitHasClassification(tag);
  if (maybeFilteredVisitsContext.value.length) {
    selectedVisit.value = maybeFilteredVisitsContext.value[0];
  }
};

const showVisitsForLocation = (location: ApiLocationResponse) => {
  // set the selected visit to the last visit with the tag,
  // and set the filter for the context to the tag.
  currentVisitsFilter.value = visitHasLocation(location.id);
  if (maybeFilteredVisitsContext.value.length) {
    selectedVisit.value = maybeFilteredVisitsContext.value[0];
  }
};

const hasVisitsForSelectedTimePeriod = computed<boolean>(() => {
  return (
    locationsWithOnlineOrActiveDevicesInSelectedTimeWindow.value.length !== 0 &&
    dashboardVisits.value.length !== 0
  );
});

const recordingUpdated = async (
  recordingId: RecordingId,
  action: "deleted" | "updated",
  newClassification?: string,
  oldClassification?: string,
) => {
  console.assert(visitsContext.value !== null);
  await recordingUpdatedInVisitsContext(
    recordingId,
    action,
    newClassification,
    oldClassification,
    selectedVisit,
    visitsContext as Ref<ApiStaticVisitResponse[]>, // TODO: Because this is potentially filtered, we might need other tests here
    route,
    (currentProject.value as SelectedProject).id,
    [],
  );
};

// TODO: When hovering a visit entry, highlight station on the map.  What's the best way to plumb this reactivity through?
</script>
<template>
  <div class="header-container">
    <section-header>Dashboard</section-header>
    <div class="dashboard-scope mt-sm-3 d-sm-flex flex-column align-items-end">
      <bimodal-switch
        class="justify-content-end"
        :modes="['Thermal', 'Audio']"
        v-model="recordingMode"
        v-if="currentSelectedProjectHasAudioAndThermal"
      />
      <div
        class="scope-filters d-flex align-items-sm-center flex-row mb-3 mb-sm-0"
      >
        <div class="d-flex align-items-center justify-content-between">
          <span class="text-secondary">Visits in the last</span>
          <!--          <select-->
          <!--            class="form-select form-select-sm text-end"-->
          <!--            v-model="visitsOrRecordings"-->
          <!--          >-->
          <!--            <option>visits</option>-->
          <!--            <option>recordings</option>-->
          <!--          </select>-->
        </div>
        <div class="d-flex align-items-center justify-content-between">
          <select
            id="select-dashboard-timespan"
            class="form-select form-select-sm text-end"
            v-model="timePeriodDays"
          >
            <option value="1">24 hours</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <!--            <option value="30">30 days</option>-->
            <!--            <option value="60">60 days</option>-->
          </select>
        </div>
        <!--        <div class="d-flex flex-row align-items-center justify-content-between">-->
        <!--          <span> grouped by species</span>-->
        <!--&lt;!&ndash;          <select&ndash;&gt;-->
        <!--&lt;!&ndash;            class="form-select form-select-sm text-end"&ndash;&gt;-->
        <!--&lt;!&ndash;            v-model="speciesOrLocations"&ndash;&gt;-->
        <!--&lt;!&ndash;          >&ndash;&gt;-->
        <!--&lt;!&ndash;            <option>species</option>&ndash;&gt;-->
        <!--&lt;!&ndash;            <option>location</option>&ndash;&gt;-->
        <!--&lt;!&ndash;          </select>&ndash;&gt;-->
        <!--        </div>-->
      </div>
    </div>
  </div>
  <div v-if="recordingMode === 'Thermal'">
    <h2 class="dashboard-subhead" v-if="hasVisitsForSelectedTimePeriod">
      Species summary
    </h2>
    <horizontal-overflow-carousel
      class="species-summary-container mb-4 mb-sm-4 mb-md-5"
      v-if="hasVisitsForSelectedTimePeriod"
    >
      <div
        class="species-summary flex-sm-nowrap flex-wrap d-flex gap-2 gap-sm-0"
      >
        <div
          v-for="[key, val] in speciesSummarySorted"
          :key="key"
          class="species-summary__item d-flex flex-row align-items-center gap-2 gap-sm-3"
          @click="showVisitsForTag(key)"
        >
          <div
            class="species-summary__item__icon p-1 p-md-2"
            :class="[...pathForTag(key).split('.')]"
            :key="`d_${key}`"
          >
            <tag-image :tag="key" :key="`i_${key}`" width="24" height="24" />
          </div>
          <div
            class="d-flex justify-content-evenly flex-sm-column align-items-center align-items-sm-start"
          >
            <div class="species-summary__item__count lh-sm me-1">
              {{ val }}
            </div>
            <div class="species-summary__item__name lh-sm text-capitalize">
              {{ displayLabelForClassificationLabel(key) }}
            </div>
          </div>
        </div>
      </div>
    </horizontal-overflow-carousel>
    <h2 class="dashboard-subhead" v-if="hasVisitsForSelectedTimePeriod">
      Visits summary
    </h2>
    <div class="row g-1 g-lg-3 mb-3 mb-sm-4 mb-md-5">
      <project-visits-summary
        v-if="!isMobileView && hasVisitsForSelectedTimePeriod"
        class="mb-3 col-12 col-lg-7 col-xl-8 order-2 order-lg-1"
        :locations="allLocations"
        :active-locations="
          locationsWithOnlineOrActiveDevicesInSelectedTimeWindow
        "
        :visits="dashboardVisits"
        :start-date="earliestDate"
        :loading="isLoading"
      />
      <visits-breakdown-list
        class="col-12 col-lg-5 col-xl-4 order-1 order-lg-2"
        :visits="dashboardVisits"
        :location="canonicalLatLngForActiveLocations"
        :highlighted-location="currentlyHighlightedLocation"
        @selected-visit="
          (visit: ApiStaticVisitResponse) => (selectedVisit = visit)
        "
        @change-highlighted-location="
          (loc: LocationId | null) => (currentlyHighlightedLocation = loc)
        "
      />
    </div>
    <h2 class="dashboard-subhead" v-if="hasVisitsForSelectedTimePeriod">
      Locations summary
    </h2>
    <horizontal-overflow-carousel
      v-if="hasVisitsForSelectedTimePeriod"
      class="locations-summary-wrapper mb-3 mb-lg-4"
    >
      <!--   TODO - Media breakpoint at which the carousel stops being a carousel? -->
      <div
        class="species-summary d-flex gap-3 flex-sm-nowrap mb-3 mb-sm-0"
        v-if="!isLoading && hasVisitsForSelectedTimePeriod"
      >
        <location-visit-summary
          v-for="(
            location, index
          ) in locationsWithOnlineOrActiveDevicesInSelectedTimeWindow"
          :location="location"
          :active-locations="
            locationsWithOnlineOrActiveDevicesInSelectedTimeWindow
          "
          @click="showVisitsForLocation(location)"
          :locations="allLocations"
          :visits="dashboardVisits"
          :key="index"
        />
      </div>
    </horizontal-overflow-carousel>
    <div
      v-if="isLoading || !hasVisitsForSelectedTimePeriod"
      class="d-flex justify-content-sm-center flex-fill flex-column align-items-center justify-content-center mb-5 mb-sm-0"
    >
      <div v-if="isLoading">
        <b-spinner variant="secondary" />
      </div>
      <div v-else class="d-flex justify-content-center flex-column">
        <div class="text-body-tertiary text-center py-3">
          <material-symbol
            name="search_off"
            size="2.4rem"
            grade="thin"
            class="mb-2"
          />
          <p>
            <!-- TODO: cater for no locations, no devices, show different copy? -->
            <span
              data-cy="no results"
              v-if="
                locationsWithOnlineOrActiveDevicesInSelectedTimeWindow.length ===
                0
              "
            >
              There were no active locations in the last
              <span v-if="timePeriodDays > 1">{{ timePeriodDays }} days</span
              ><span v-else>day</span> for this project.
            </span>
            <span v-else data-cy="no results">
              There were no visits for any target species in any of the active
              locations in the last
              <span v-if="timePeriodDays > 1">{{ timePeriodDays }} days</span
              ><span v-else>day</span> for this project.
            </span>
          </p>
          <b-button
            variant="outline-secondary"
            :to="{
              name: 'activity',
              params: {
                projectName: urlNormalisedCurrentProjectName,
              },
              query: {
                displayMode: ActivitySearchDisplayMode.Visits,
              },
            }"
            >View latest visits</b-button
          >
        </div>
      </div>
    </div>
  </div>
  <div v-else>Audio dashboard!</div>
  <inline-view-modal
    @close="selectedVisit = null"
    @recording-updated="recordingUpdated"
    :fade-in="loadedRouteName === 'dashboard'"
    :parent-route-name="'dashboard'"
    @shown="() => (loadedRouteName = 'dashboard')"
  />
</template>
<style lang="less" scoped>
@import "../assets/less/breakpoints.less";
@import "../assets/less/typography.less";
@import "../assets/less/elevation.less";
.header-container {
  @media screen and (min-width: @breakpoint-sm) {
    position: relative;
  }
}
.dashboard-scope {
  @media screen and (min-width: @breakpoint-sm) {
    position: absolute;
    top: 0;
    right: 0;
  }
}
.scope-filters {
  .form-select {
    background-color: unset;
    border: 0;
    width: auto;
  }
  span {
    white-space: nowrap;
  }
}

.dashboard-subhead {
  margin-bottom: var(--cp-spacing-md);
  font-size: var(--cp-font-size-h4);
  @media screen and (max-width: @breakpoint-sm-max) {
    margin-top: var(--cp-spacing-xs);
  }
}

.species-summary-container {
  border-radius: var(--bs-border-radius);
  @media screen and (min-width: @breakpoint-sm) {
    background: white;
    .standard-shadow();
  }
}

.species-summary {
  user-select: none;
  &__item {
    background: var(--bs-white);
    cursor: pointer;
    @media screen and (max-width: @breakpoint-xs-max) {
      padding: var(--cp-spacing-xs);
      flex: 0 0 calc(50% - calc(var(--cp-spacing-xs) / 2));
      border-radius: var(--bs-border-radius-sm);
      .standard-shadow();
    }
    @media screen and (min-width: @breakpoint-sm) {
      padding: var(--cp-spacing-md);
      border-right: 1px solid var(--border-color-light);
      transition: background-color 0.2s ease-in-out;
      flex: 1 0 auto;
      &:last-child {
        border-right: none;
      }
      //min-width: 130px; // TODO @media breakpoints
    }
    @media screen and (min-width: @breakpoint-xl) {
      padding: var(--cp-spacing-lg);
    }
    &:hover {
      background-color: var(--bs-gray-100);
    }
    &__icon {
      background: color-mix(
        in srgb,
        var(--cp-tag-no-priority),
        transparent 88%
      );
      border-radius: var(--bs-border-radius-sm);
      &.mustelid {
        background: color-mix(
          in srgb,
          var(--cp-tag-priority-badge-1),
          transparent 88%
        );
      }
      &.possum,
      &.cat {
        background: color-mix(
          in srgb,
          var(--cp-tag-priority-badge-2),
          transparent 88%
        );
      }
      &.rodent,
      &.hedgehog {
        background: color-mix(
          in srgb,
          var(--cp-tag-priority-badge-3),
          transparent 88%
        );
      }
    }
    &__count {
      font-weight: var(--cp-font-weight-semilbold);
      @media screen and (min-width: @breakpoint-sm) {
        font-size: var(--cp-font-size-h2);
      }
    }
    &__name {
      @media screen and (min-width: @breakpoint-sm) {
        font-size: var(--cp-font-size-lg);
        color: var(--bs-secondary-color);
      }
    }
  }
}
</style>
<style lang="less">
@import "../assets/less/breakpoints.less";
// make sure that the shadow of the species summary displays
@media screen and (max-width: @breakpoint-xs-max) {
  .species-summary-container {
    margin: -2px -2px 0;
    .inner {
      padding: 2px 2px 4px;
    }
  }
}
// make sure that the shadow and hover effect of the location card displays - it won't otherwise because of the overflow hidden property
.locations-summary-wrapper {
  margin: -2px -2px 0;
  .inner {
    padding: 2px 2px 4px;
  }
}
</style>

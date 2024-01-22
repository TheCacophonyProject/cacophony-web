<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, inject, onMounted, provide, ref, watch } from "vue";
import type { Ref, ComputedRef } from "vue";
import { getAllVisitsForProject } from "@api/Monitoring";
import { showUnimplementedModal } from "@models/LoggedInUser";
import type { SelectedProject } from "@models/LoggedInUser";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import HorizontalOverflowCarousel from "@/components/HorizontalOverflowCarousel.vue";
import InlineViewModal from "@/components/InlineViewModal.vue";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { getLocationsForProject } from "@api/Project";
import ProjectVisitsSummary from "@/components/ProjectVisitsSummary.vue";
import LocationVisitSummary from "@/components/LocationVisitSummary.vue";
import VisitsBreakdownList from "@/components/VisitsBreakdownList.vue";
import { BSpinner } from "bootstrap-vue-3";
import type { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import { useRoute, useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import Shepherd from "shepherd.js";
import "shepherd.js/dist/css/shepherd.css";
import { offset } from "@floating-ui/dom";
import {
  classifications,
  getClassifications,
  displayLabelForClassificationLabel,
  getClassificationForLabel,
} from "@api/Classifications";
import TagImage from "@/components/TagImage.vue";
import {
  activeLocations,
  currentSelectedProject as currentActiveProject,
  latLngForActiveLocations,
  userProjects,
} from "@models/provides";
import type { LoadedResource } from "@api/types";
import BimodalSwitch from "@/components/BimodalSwitch.vue";
import { canonicalLatLngForLocations } from "@/helpers/Location";
import { sortTagPrecedence } from "@models/visitsUtils";
import type { StationId as LocationId } from "@typedefs/api/common";
import {
  setUserOnboarding,
  updateUserOnboarding,
  getUserOnboarding,
} from "@/api/User";

const selectedVisit = ref<ApiVisitResponse | null>(null);
const currentlyHighlightedLocation = ref<LocationId | null>(null);
const visitsContext = ref<ApiVisitResponse[] | null>(null);
const showUserDashboardOnboarding = ref<boolean>(false);
provide("currentlySelectedVisit", selectedVisit);
provide("currentlyHighlightedLocation", currentlyHighlightedLocation);

const initUserSettings = async () => {
  const result = await getUserOnboarding();
  if (JSON.stringify(result.result.onboardTracking) === "{}") {
    const postResult = await setUserOnboarding({
      settings: {
        onboardTracking: {
          dashboard: false,
          locations: false,
          activity: false,
          devices: false,
          manage_project: false,
        },
      },
    });
    console.log(postResult.result.messages);
  }
};

const getUserDashboardOnboardingStatus = async () => {
  try {
    const result = await getUserOnboarding();
    const onboardTrackingData = result || {};
    return onboardTrackingData.result.onboardTracking.dashboard;
  } catch (error) {
    console.error("Error getting user onboarding data", error);
    return false;
  }
};

const tour = new Shepherd.Tour({
  useModalOverlay: true,
  defaultStepOptions: {
    classes: "shepherd-theme-arrows",
    scrollTo: true,
  },
});

const SHEPHERD_NEXT_PREV_BUTTONS = [
  {
    action(): any {
      return (this as any).back();
    },
    classes: "shepherd-button-secondary",
    text: "Back",
  },
  {
    action(): any {
      return (this as any).next();
    },
    text: "Next",
  },
];

const initDashboardTour = () => {
  if (!showUserDashboardOnboarding.value) {
    tour.addStep({
      title: `Welcome to your Dashboard`,
      text: `The dashboard gives you an overview of the animal visits from your devices within the group. 
      Each group can host multiple devices which have their own associated recordings`,
      classes: "shepherd-custom-content",
      buttons: SHEPHERD_NEXT_PREV_BUTTONS,
    });
    tour.addStep({
      attachTo: {
        element: document.querySelector(
          ".project-visits-summary-section"
        ) as HTMLElement,
        on: "top",
      },
      title: "1/3",
      text: `This is yor visits summary - it highlights the animal visits across a time period, with location and timestamped information`,
      buttons: SHEPHERD_NEXT_PREV_BUTTONS,
      modalOverlayOpeningPadding: 6,
      modalOverlayOpeningRadius: 4,
      floatingUIOptions: {
        middleware: [offset({ mainAxis: 30, crossAxis: 0 })],
      },
    });
    tour.addStep({
      attachTo: {
        element: document.querySelector(
          ".species-summary-heading"
        ) as HTMLElement,
        on: "bottom",
      },
      title: "2/3",
      text: `This is your species overview - gives you a breakdown on species over the specified period.`,
      buttons: SHEPHERD_NEXT_PREV_BUTTONS,
      modalOverlayOpeningPadding: 6,
      modalOverlayOpeningRadius: 4,
      floatingUIOptions: {
        middleware: [offset({ mainAxis: 0, crossAxis: 50 })],
      },
    });
    tour.addStep({
      attachTo: {
        element: document.querySelector(
          ".stations-summary-heading"
        ) as HTMLElement,
        on: "right",
      },
      title: "3/3",
      text: "This is your stations summary",
      buttons: [
        {
          action(): any {
            return (this as any).back();
          },
          classes: "shepherd-button-secondary",
          text: "Back",
        },
        {
          action(): any {
            window.localStorage.setItem("show-onboarding", "false");
            return (this as any).complete();
          },
          text: "Finish",
        },
      ],
      modalOverlayOpeningPadding: 6,
      modalOverlayOpeningRadius: 4,
      floatingUIOptions: {
        middleware: [offset({ mainAxis: -100, crossAxis: -120 })],
      },
    });
    tour.on("cancel", () => {
      window.localStorage.setItem("show-onboarding", "false");
    });
    tour.start();
    updateUserOnboarding({ settings: { onboardTracking: { dashboard: true } } })
      .then((response) => {
        console.log("User onboarding data updated successfully", response);
      })
      .catch((error) => {
        console.error("Error updating user onboarding data", error);
      });
  }
};

const currentVisitsFilter = ref<((visit: ApiVisitResponse) => boolean) | null>(
  null
);

const currentVisitsFilterComputed = computed<
  (visit: ApiVisitResponse) => boolean
>(() => {
  if (currentVisitsFilter.value === null) {
    return visitorIsPredator;
  } else {
    return currentVisitsFilter.value;
  }
});

// TODO: Move to provides/inject
const maybeFilteredVisitsContext = computed<ApiVisitResponse[]>(() => {
  if (visitsContext.value) {
    return (visitsContext.value as ApiVisitResponse[]).filter(
      currentVisitsFilterComputed.value
    );
  }
  return [];
});

provide("visitsContext", maybeFilteredVisitsContext);
const onlyShowPredators = ref<boolean>(true);
const ignored: string[] = [
  "none",
  //"unidentified",
  //"false-positive",
  "bird",
  "vehicle",
  "human",
  "insect",
];
const visitorIsPredator = (visit: ApiVisitResponse): boolean => {
  if (onlyShowPredators.value) {
    if (visit && visit.classification) {
      if (ignored.includes(visit.classification)) {
        return false;
      }
      const classification = getClassificationForLabel(visit.classification);
      if (classification && typeof classification.path === "string") {
        const parts = classification.path.split(".");
        for (const part of parts) {
          if (ignored.includes(part)) {
            return false;
          }
        }
      }
    }
  }
  return true;
};

const visitHasClassification =
  (tag: string) =>
  (visit: ApiVisitResponse): boolean => {
    return (visit &&
      visit.classification &&
      visit.classification === tag) as boolean;
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

const maybeFilteredDashboardVisitsContext = computed<ApiVisitResponse[]>(() => {
  if (visitsContext.value) {
    return (visitsContext.value as ApiVisitResponse[]).filter(
      visitorIsPredator
    );
  }
  return [];
});

// Two ways we can go about next/prev visit.  We pass the loaded visits through from the parent context,
// and then move through them as an array index.

// Otherwise, we pass the visit context/scope (group or a set of stations) to the recordings view,
// and when it reaches the end of the current visit set, it queries for prev/next visit using the visit start/end time, and the scope.
// Second option is more resilient to changes of classification, although if the classification changes, we also need to broadcast that
// to the parent list, and have that refresh...

watch(
  selectedVisit,
  (visit: ApiVisitResponse | null, prevVisit: ApiVisitResponse | null) => {
    if (visit && !prevVisit) {
      // Set route so that modal shows up
      const recordingIds = visit.recordings.map(({ recId }) => recId);
      const params = {
        visitLabel: visit.classification,
        currentRecordingId: recordingIds[0].toString(),
      };
      if (recordingIds.length > 1) {
        (params as Record<string, string>).recordingIds =
          recordingIds.join(",");
      }
      router.push({
        name: "dashboard-visit",
        params,
      });
    } else if (!visit && prevVisit) {
      // We've stopped having a selected visit modal
      currentVisitsFilter.value = null;
    }
  }
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

const locations = ref<LoadedResource<ApiLocationResponse[]>>(null);

const speciesSummary = computed<Record<string, number>>(() => {
  return maybeFilteredDashboardVisitsContext.value.reduce(
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
});

const speciesSummarySorted = computed(() => {
  return Object.entries(speciesSummary.value).sort(
    ([a]: [string, number], [b]: [string, number]) => sortTagPrecedence(a, b)
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
    const allVisits = await getAllVisitsForProject(
      (currentProject.value as SelectedProject).id,
      timePeriodDays.value,
      (val) => {
        // TODO - Do we want to display loading progress via the UI?
        loadingVisitsProgress.value = val;
      }
    );
    visitsContext.value = allVisits.visits;
  }
};

const reloadDashboard = async () => {
  await Promise.all([loadLocations(), loadVisits()]);
};

watch(timePeriodDays, loadVisits);
watch(currentProject, reloadDashboard);

const loadedRouteName = ref<string>("");
onMounted(async () => {
  loadedRouteName.value = route.name as string;
  if (!classifications.value) {
    await getClassifications();
  }
  initUserSettings();
  showUserDashboardOnboarding.value = await getUserDashboardOnboardingStatus();
  initDashboardTour();
});
// I don't think the underlying data changes?
//watch(visitsOrRecordings, reloadDashboard);
//watch(speciesOrStations, reloadDashboard);
// TODO - Use this to show which stations *could* have had recordings, but may have had no activity.
const locationsWithOnlineOrActiveDevicesInSelectedTimeWindow = computed<
  ApiLocationResponse[]
>(() => {
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

provide(
  activeLocations,
  locationsWithOnlineOrActiveDevicesInSelectedTimeWindow
);

const allLocations = computed<ApiLocationResponse[]>(() => {
  return (locations.value && (locations.value as ApiLocationResponse[])) || [];
});

const loadLocations = async () => {
  if (currentProject.value) {
    locations.value = null;
    locations.value = await getLocationsForProject(
      (currentProject.value as SelectedProject).id.toString(),
      true
    );
  }
};

const canonicalLatLngForActiveLocations = canonicalLatLngForLocations(
  locationsWithOnlineOrActiveDevicesInSelectedTimeWindow
);

// TODO - Maybe this should be some global context variable too.
provide(latLngForActiveLocations, canonicalLatLngForActiveLocations);

onMounted(async () => {
  await reloadDashboard();
  // Load visits for time period.
  // Get species summary.
});

const isLoading = computed<boolean>(
  () => locations.value === null || visitsContext.value === null
);

const currentSelectedProject = computed<ApiProjectResponse | null>(() => {
  if (currentProject.value && availableProjects.value) {
    const project = (availableProjects.value as ApiProjectResponse[]).find(
      ({ id }) => id === (currentProject.value as SelectedProject).id
    );
    return project || null;
  }
  return null;
});

const currentSelectedProjectHasAudio = computed<boolean>(() => {
  return (
    !!currentSelectedProject.value &&
    "lastAudioRecordingTime" in currentSelectedProject.value
  );
});

const currentSelectedProjectHasCameras = computed<boolean>(() => {
  return (
    !!currentSelectedProject.value &&
    "lastThermalRecordingTime" in currentSelectedProject.value
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

const hasVisitsForSelectedTimePeriod = computed<boolean>(() => {
  return (
    locationsWithOnlineOrActiveDevicesInSelectedTimeWindow.value.length !== 0
  );
});

// TODO: When hovering a visit entry, highlight station on the map.  What's the best way to plumb this reactivity through?
</script>
<template>
  <div class="header-container">
    <section-header>Dashboard</section-header>
    <div class="dashboard-scope mt-sm-3 d-sm-flex flex-column align-items-end">
      <bimodal-switch
        :modes="['Thermal', 'Audio']"
        v-model="recordingMode"
        v-if="currentSelectedProjectHasAudioAndThermal"
      />
      <div
        class="scope-filters d-flex align-items-sm-center flex-column flex-sm-row mb-3 mb-sm-0"
      >
        <div class="d-flex flex-row align-items-center justify-content-between">
          <span>View </span>
          <select
            class="form-select form-select-sm text-end"
            v-model="visitsOrRecordings"
          >
            <option>visits</option>
            <option>recordings</option>
          </select>
        </div>
        <div class="d-flex flex-row align-items-center justify-content-between">
          <span> in the last </span>
          <select
            class="form-select form-select-sm text-end"
            v-model="timePeriodDays"
          >
            <option value="7">7 days</option>
            <option value="1">24 hours</option>
            <option value="3">3 days</option>
          </select>
        </div>
        <div class="d-flex flex-row align-items-center justify-content-between">
          <span> grouped by </span>
          <select
            class="form-select form-select-sm text-end"
            v-model="speciesOrLocations"
          >
            <option>species</option>
            <option>location</option>
          </select>
        </div>
      </div>
    </div>
  </div>
  <div class="species-summary-heading">
    <h2 class="dashboard-subhead" v-if="hasVisitsForSelectedTimePeriod">
      Species summary
    </h2>
    <horizontal-overflow-carousel
      class="species-summary-container mb-sm-5 mb-4"
      v-if="hasVisitsForSelectedTimePeriod"
    >
      <div class="card-group species-summary flex-sm-nowrap flex-wrap d-flex">
        <div
          v-for="[key, val] in speciesSummarySorted"
          :key="key"
          class="d-flex flex-row species-summary-item align-items-center"
          @click="showVisitsForTag(key)"
        >
          <tag-image :tag="key" width="24" height="24" class="ms-sm-3 ms-1" />
          <div
            class="d-flex justify-content-evenly flex-sm-column ms-sm-3 ms-2 pe-sm-3 pe-1 align-items-center align-items-sm-start"
          >
            <div class="species-count pe-sm-0 pe-1 lh-sm">{{ val }}</div>
            <div class="species-name lh-sm small text-capitalize">
              {{ displayLabelForClassificationLabel(key) }}
            </div>
          </div>
        </div>
      </div>
    </horizontal-overflow-carousel>
  </div>
  <h2 class="dashboard-subhead" v-if="hasVisitsForSelectedTimePeriod">
    Visits summary
  </h2>
  <div class="project-visits-summary-section d-md-flex flex-md-row">
    <project-visits-summary
      v-if="!isMobileView && hasVisitsForSelectedTimePeriod"
      class="mb-5 flex-md-fill"
      :locations="allLocations"
      :active-locations="locationsWithOnlineOrActiveDevicesInSelectedTimeWindow"
      :visits="maybeFilteredDashboardVisitsContext"
      :start-date="earliestDate"
      :loading="isLoading"
    />
    <visits-breakdown-list
      :visits="maybeFilteredDashboardVisitsContext"
      :location="canonicalLatLngForActiveLocations"
      :highlighted-location="currentlyHighlightedLocation"
      @selected-visit="(visit) => (selectedVisit = visit)"
      @change-highlighted-location="
        (loc) => (currentlyHighlightedLocation = loc)
      "
    />
  </div>
  <div class="stations-summary-heading">
    <h2 class="dashboard-subhead" v-if="hasVisitsForSelectedTimePeriod">
      Stations summary {{ loadedRouteName }}
    </h2>
    <horizontal-overflow-carousel class="mb-5">
      <!--   TODO - Media breakpoint at which the carousel stops being a carousel? -->
      <b-spinner v-if="isLoading" />
      <div
        class="card-group species-summary flex-sm-nowrap"
        v-else-if="hasVisitsForSelectedTimePeriod"
      >
        <location-visit-summary
          v-for="(
            station, index
          ) in locationsWithOnlineOrActiveDevicesInSelectedTimeWindow"
          :location="station"
          :active-locations="
            locationsWithOnlineOrActiveDevicesInSelectedTimeWindow
          "
          :locations="allLocations"
          :visits="maybeFilteredDashboardVisitsContext"
          :key="index"
        />
      </div>
      <div v-else>
        There were no active locations in the last {{ timePeriodDays }} days for
        this project.
      </div>
    </horizontal-overflow-carousel>
  </div>
  <inline-view-modal
    @close="selectedVisit = null"
    :fade-in="loadedRouteName === 'dashboard'"
    :parent-route-name="'dashboard'"
    @shown="() => (loadedRouteName = 'dashboard')"
  />
</template>
<style lang="less" scoped>
@import "../assets/font-sizes.less";

.group-name {
  text-transform: uppercase;
  color: #aaa;
  font-family: "Roboto Medium", "Roboto Regular", Roboto, sans-serif;
  font-weight: 500;
  // font-size: var(--bs-body-font-size);
  // FIXME - Use modified bs-body-font-size?
  font-size: 14px;
}
h1 {
  font-family: "Roboto Bold", "Roboto Regular", "Roboto", sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #444;
}
h2 {
  font-family: "Roboto Medium", "Roboto Regular", "Roboto", sans-serif;
  font-weight: 500;
  color: #444;
  font-size: 17px;
}
.header-container {
  @media screen and (min-width: 576px) {
    position: relative;
  }
}
.dashboard-scope {
  @media screen and (min-width: 576px) {
    position: absolute;
    top: 0;
    right: 0;
  }
}
.scope-filters {
  font-size: 14px;
  color: #999;
  .form-select {
    background-color: unset;
    border: 0;
    width: auto;
  }
  span {
    white-space: nowrap;
  }
}

.species-summary-container {
  @media screen and (min-width: 576px) {
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
    background: white;
  }
}

.species-summary {
  min-height: 68px;
  user-select: none;
  .species-summary-item {
    border: 1px solid #ccc;
    // From card
    border-radius: unset;
    //border-width: 0;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
    @media screen and (min-width: 576px) {
      box-shadow: unset;
      border-left-width: 0;
      border-bottom-width: 0;
      border-top-width: 0;
      border-right-width: 1px;
      margin: unset;
      &:last-child {
        border-right-width: 0;
      }
    }
    //

    &:nth-child(even) {
      margin: 0 0 4px 2px;
    }
    &:nth-child(odd) {
      margin: 0 2px 4px 0;
    }
    height: 47px;
    @media screen and (min-width: 576px) {
      height: unset;
      &:nth-child(even) {
        margin: unset;
      }
      &:nth-child(odd) {
        margin: unset;
      }
    }
    cursor: pointer;
    user-select: none;
    text-decoration: none;
    color: inherit;
    padding: 2px;
    width: calc(50% - 2px);
    //min-width: 130px; // TODO @media breakpoints
    transition: background-color 0.2s ease-in-out;

    &:hover {
      background-color: #ececec;
    }
    @media screen and (min-width: 576px) {
      //width: unset;
      margin: unset;
    }

    .species-count {
      font-weight: 500;
    }
    .species-name,
    .species-count {
      .fs-7();
    }
    @media screen and (min-width: 576px) {
      .species-count {
        .fs-4();
      }
      .species-name {
        .fs-6();
      }
    }
  }
}

.custom-class {
  border: 2px solid green;
}
.dashboard-subhead {
  .fs-6();
  @media screen and (min-width: 576px) {
    font-size: unset;
  }
}
</style>
<style lang="less">
.species-summary-item {
  > img {
    min-width: 24px;
    min-height: 24px;
  }
}
</style>

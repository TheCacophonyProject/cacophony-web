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
import { BBadge, BButton, BSpinner, BTooltip } from "bootstrap-vue-next";
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
  FloatZeroToOne,
  LatLng,
  RecordingId,
  StationId as LocationId,
} from "@typedefs/api/common";
import { DEFAULT_DASHBOARD_IGNORED_CAMERA_TAGS } from "@/consts.ts";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import {
  ActivitySearchDisplayMode,
  ActivitySearchRecordingMode,
} from "@/components/activitySearchUtils.ts";
import type { ApiStaticVisitResponse } from "@typedefs/api/visit";
import { recordingUpdatedInVisitsContext } from "@/helpers/patch-visits-context.ts";
import CardTable from "@/components/CardTable.vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { RecordingType } from "@typedefs/api/consts.ts";

const selectedVisit = ref<ApiStaticVisitResponse | null>(null);
const currentlyHighlightedLocation = ref<LocationId | null>(null);
const visitsContext = ref<ApiStaticVisitResponse[] | null>(null);
const audioRecordingsContext = ref<ApiRecordingResponse[] | null>(null);
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

const dashboardAudioRecordings = computed<ApiRecordingResponse[]>(() => {
  return (
    (audioRecordingsContext.value || []) as ApiRecordingResponse[]
  ).filter((recording) => recording);
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
const timePeriodDays = ref<number>(60);
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

const loadAudioRecordings = async () => {
  if (currentProject.value) {
    audioRecordingsContext.value = null;
    audioRecordingsContext.value =
      await ClientApi.Recordings.getAllRecordingsForProjectBetweenTimes(
        (currentProject.value as SelectedProject).id,
        {
          fromDateTime: fromTime.value,
          untilDateTime: new Date(),
          types: [RecordingType.Audio],
          taggedWith: ["all.bird"],
          subClassTags: true,
          includeFilteredFalsePositivesAndNones: false,
        },
      );
  }
};

const reloadDashboard = async (nextProject: SelectedProject | false) => {
  if (nextProject) {
    if (recordingMode.value === "Thermal") {
      await Promise.all([loadLocations(), loadVisits()]);
    } else {
      await Promise.all([loadLocations(), loadAudioRecordings()]);
    }
  }
};

watch(timePeriodDays, async () => {
  if (recordingMode.value === "Thermal") {
    await loadVisits();
  } else {
    await loadAudioRecordings();
  }
});
watch(currentProject, reloadDashboard);
watch(recordingMode, async () => {
  if (recordingMode.value === "Thermal") {
    await loadVisits();
  } else {
    await loadAudioRecordings();
  }
});

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

const isLoading = computed<boolean>(() => {
  if (locations.value === null) {
    return true;
  }
  if (recordingMode.value === "Thermal" && visitsContext.value === null) {
    return true;
  } else if (
    recordingMode.value === "Audio" &&
    audioRecordingsContext.value === null
  ) {
    return true;
  }
  return false;
});

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

const hasAudioRecordingsForSelectedTimePeriod = computed<boolean>(() => {
  return (
    locationsWithOnlineOrActiveDevicesInSelectedTimeWindow.value.length !== 0 &&
    dashboardAudioRecordings.value.length !== 0
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

interface BirdDetectionsItem {
  rank: number;
  birdName: string;
  conservationStatus: string;
  biostatus: string;
  __conservationStatusCode: string;
  detections: number;
  locations: FloatZeroToOne;
}

const audioItems = computed<BirdDetectionsItem[]>(() => {
  const recordings = dashboardAudioRecordings.value;
  // We count a detection as one or more tags in each one minute recording.
  // We don't count the same tag twice in a given recording
  const recordingsBySpecies = new Map<string, number>();
  const locationsPerSpecies = new Map<string, Set<number>>();
  const numAudioLocations =
    locationsWithOnlineOrActiveDevicesInSelectedTimeWindow.value.length;
  for (const recording of recordings) {
    const uniqueTagsInRecording = new Set<string>();
    for (const track of recording.tracks) {
      const uniqueTags = new Set(
        track.tags
          .filter((tag) => tag.path.startsWith("all.bird."))
          .map((tag) => tag.path),
      );
      for (const tag of uniqueTags) {
        uniqueTagsInRecording.add(tag);
      }
    }
    for (const path of uniqueTagsInRecording.values()) {
      const count = recordingsBySpecies.getOrInsert(path, 0);
      recordingsBySpecies.set(path, count + 1);
      if (recording.stationId) {
        locationsPerSpecies
          .getOrInsert(path, new Set())
          .add(recording.stationId);
      }
    }
  }
  const result = [];
  const species = Array.from(recordingsBySpecies.entries());
  species.sort((a, b) => {
    return b[1] - a[1];
  });
  for (const [path, count] of species) {
    result.push({
      birdName: displayLabelForClassificationLabel(
        visitClassificationLabelFromPath(path).replaceAll("_", " "),
        false,
        true,
      ),
      detections: count,
      biostatus: "Endemic",
      conservationStatus: "Least concern",
      __conservationStatusCode: "lc",
      locations: (locationsPerSpecies.get(path)?.size || 0) / numAudioLocations,
    });
  }
  return result as BirdDetectionsItem[];
});
const maxDetections = computed<number>(() => {
  // return audioItems.value
  //   .map((item) => item.detections)
  //   .reduce((acc, n) => {
  //     return acc + n;
  //   }, 0);
  return Math.max(...audioItems.value.map(item => item.detections));
});

// TODO: When hovering a visit entry, highlight station on the map.  What's the best way to plumb this reactivity through?
</script>
<template>
  <div class="header-container">
    <section-header>Dashboard</section-header>

    <div
      class="d-flex align-items-center justify-content-between mb-3 mb-sm-4 mb-md-1 mb-lg-2"
    >
      <div class="dashboard-scope-type">
        <div
          class="btn-group btn-group-md d-flex"
          role="group"
          aria-label="Toggle between camera and bird monitor results"
          v-if="currentSelectedProjectHasAudioAndThermal"
        >
          <input
            type="radio"
            class="btn-check"
            name="recording-mode"
            id="recording-mode-cameras"
            autocomplete="off"
            v-model="recordingMode"
            value="Thermal"
          />
          <label
            class="btn btn-radio-group btn-md w-50 d-flex align-items-center justify-content-center px-lg-3"
            for="recording-mode-cameras"
          >
            <material-symbol name="videocam" class="me-2" size="1.25rem" />
            Thermal
          </label>
          <input
            type="radio"
            class="btn-check"
            name="recording-mode"
            id="recording-mode-audio"
            autocomplete="off"
            v-model="recordingMode"
            value="Audio"
          />
          <label
            class="btn btn-radio-group btn-md w-50 d-flex align-items-center justify-content-center px-lg-3"
            for="recording-mode-audio"
          >
            <material-symbol name="music_note" class="me-2" size="1.25rem" />
            Audio
          </label>
        </div>
      </div>

      <div class="dashboard-scope-time">
        <div class="filters d-flex align-items-center">
          <div class="d-flex align-items-center justify-content-between">
            <span class="d-inline-block d-lg-none text-secondary"
              >In the last</span
            >
            <span class="d-none d-lg-inline-block text-secondary"
              ><span v-if="recordingMode === 'Thermal'">Visits</span
              ><span v-else>Detections</span> in the last</span
            >
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
              <option value="30">30 days</option>
              <option value="60">60 days</option>
            </select>
          </div>
          <!--          <div class="d-flex flex-row align-items-center justify-content-between">-->
          <!--            <span> grouped by species</span>-->
          <!--            <select-->
          <!--              class="form-select form-select-sm text-end"-->
          <!--              v-model="speciesOrLocations"-->
          <!--            >-->
          <!--              <option>species</option>-->
          <!--              <option>location</option>-->
          <!--            </select>-->
          <!--          </div>-->
        </div>
      </div>
    </div>
  </div>
  <div v-if="recordingMode === 'Thermal'">
    <h2 class="dashboard-subhead" v-if="hasVisitsForSelectedTimePeriod">
      Species summary
    </h2>
    <horizontal-overflow-carousel
      class="species-summary-container-thermal mb-4 mb-sm-4 mb-md-5"
      v-if="hasVisitsForSelectedTimePeriod"
    >
      <div
        class="species-summary-thermal flex-sm-nowrap flex-wrap d-flex gap-2 gap-sm-0"
      >
        <div
          v-for="[key, val] in speciesSummarySorted"
          :key="key"
          class="species-summary-thermal__item d-flex flex-row align-items-center gap-2 gap-sm-3"
          @click="showVisitsForTag(key)"
        >
          <div
            class="species-summary-thermal__item__icon p-1 p-md-2"
            :class="[...pathForTag(key).split('.')]"
            :key="`d_${key}`"
          >
            <tag-image :tag="key" :key="`i_${key}`" width="24" height="24" />
          </div>
          <div
            class="d-flex justify-content-evenly flex-sm-column align-items-center align-items-sm-start"
          >
            <div class="species-summary-thermal__item__count lh-sm me-1">
              {{ val }}
            </div>
            <div
              class="species-summary-thermal__item__name lh-sm text-capitalize"
            >
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
        class="species-summary-thermal d-flex gap-3 flex-sm-nowrap mb-3 mb-sm-0"
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
  <div v-else>
    <h2
      class="dashboard-subhead"
      v-if="hasAudioRecordingsForSelectedTimePeriod"
    >
      Species summary
    </h2>
    <div
      class="species-summary-container-audio mb-5"
      v-if="hasAudioRecordingsForSelectedTimePeriod"
    >
      <div class="featured_species_container container-fluid">
        <div class="row gap-3 mb-3 mb-md-4 mb-lg-5">
          <div
            v-for="(bird, index) in audioItems.slice(0, 3)"
            :key="index"
            class="featured-species col d-flex flex-column container p-3 lh-sm rounded-3 shadow-sm bg-white"
            :class="{
              'col-12 ': index === 0 && isMobileView,
              'order-2 ': index === 0 && !isMobileView,
              'mt-sm-4 order-1': index === 1 && !isMobileView,
              'mt-sm-5 order-3': index === 2 && !isMobileView,
            }"
          >
            <div class="row">
              <div
                class="featured-species__rank col-lg-3 col-xxl-2 text-secondary text-opacity-25"
              >
                <span class="d-block mb-2 mb-lg-0 ms-lg-2 ms-xxl-0">{{
                  index + 1
                }}</span>
              </div>
              <div class="col-lg-9 col-xxl-10">
                <h3
                  class="mt-1 mb-2 text-capitalize"
                  :class="isMobileView ? 'h4' : 'h3'"
                >
                  {{ bird.birdName }}
                </h3>
                <p class="mb-2 d-flex gap-2 align-items-center">
                  <span>{{ bird.detections }}&nbsp;detections</span>
                  <span
                    class="detections-bar d-block rounded-1"
                    :style="`width: max(4px, ${(bird.detections / maxDetections) * 100}%)`"
                  ></span>
                </p>
                <p class="mb-3 d-flex gap-2 align-items-center">
                  <span>{{ bird.locations * 100 }}% locations</span>
                  <span
                    class="locations-chart d-block rounded-5"
                    :style="`background: conic-gradient(
                        transparent 0deg ${360 - bird.locations * 360}deg,
                        var(--cp-color-green-600) ${360 - bird.locations * 360}deg 360deg
                      );`"
                  ></span>
                </p>
              </div>
            </div>
            <div
              class="d-flex mt-auto gap-2 justify-content-end align-items-baseline"
            >
              <b-badge
                class="biostatus"
                :class="bird.biostatus.toLowerCase()"
                >{{ bird.biostatus }}</b-badge
              >
              <b-tooltip>
                <template #target>
                  <span
                    class="conservation-status mini d-flex align-items-center justify-content-center rounded-4"
                    :class="bird.__conservationStatusCode"
                    >{{ bird.__conservationStatusCode }}</span
                  >
                </template>
                {{ bird.conservationStatus }}
              </b-tooltip>
            </div>
          </div>
        </div>
      </div>
      <card-table
        :items="audioItems"
        compact
        :max-card-width="768"
        class="mb-3"
        :standalone="!isMobileView"
        :class="isMobileView ? 'bg-white p-3 shadow-sm rounded-3' : ''"
      >
        <template #birdName="{ cell }">
          <span class="text-capitalize">{{ cell }}</span>
        </template>
        <template #biostatus="{ cell }">
          <b-badge class="biostatus" :class="cell.toLowerCase()">{{
            cell
          }}</b-badge>
        </template>
        <template #conservationStatus="{ cell, row }">
          <b-badge
            class="conservation-status"
            :class="row.__conservationStatusCode"
            >{{ cell }}</b-badge
          >
        </template>
        <template #detections="{ cell }">
          <div class="d-flex gap-2 align-items-center">
            <span>{{ cell }}</span>
            <span
              class="detections-bar d-block rounded-1"
              :style="`width: max(4px, ${(cell / maxDetections) * 100}%)`"
            ></span>
          </div>
        </template>
        <template #locations="{ cell }">
          <div class="d-flex gap-2 align-items-center">
            {{ cell * 100 }}%
            <span
              class="locations-chart d-block rounded-5"
              :style="`background: conic-gradient(
                        transparent 0deg ${360 - cell * 360}deg,
                        var(--cp-color-green-600) ${360 - cell * 360}deg 360deg
                      );`"
            ></span>
          </div>
        </template>

        <template #card="{ card }">
          <div class="d-flex align-items-baseline">
            <h3 class="h4 flex-grow-1 text-capitalize">{{ card.birdName }}</h3>
            <div class="d-flex gap-2 justify-content-end align-items-baseline">
              <b-badge
                class="biostatus"
                :class="card.biostatus.toLowerCase()"
                >{{ card.biostatus }}</b-badge
              >
              <b-tooltip>
                <template #target>
                  <span
                    class="conservation-status mini d-flex align-items-center justify-content-center rounded-4"
                    :class="card.__conservationStatusCode"
                    >{{ card.__conservationStatusCode }}</span
                  >
                </template>
                {{ card.conservationStatus }}
              </b-tooltip>
            </div>
          </div>
          <p class="d-flex gap-2 align-items-center mb-1 fs-6">
            <span>{{ card.detections }}&nbsp;detections</span>
            <span
              class="detections-bar d-block rounded-1"
              :style="`width: max(4px, ${(card.detections / maxDetections) * 100}%)`"
            ></span>
          </p>

          <p class="d-flex gap-2 align-items-center mb-0 fs-6">
            {{ card.locations * 100 }}% locations
            <span
              class="locations-chart d-block rounded-5"
              :style="`background: conic-gradient(
                        transparent 0deg ${360 - card.locations * 360}deg,
                        var(--cp-color-green-600) ${360 - card.locations * 360}deg 360deg
                      );`"
            ></span>
          </p>
        </template>
      </card-table>
    </div>

    <h2
      class="dashboard-subhead"
      v-if="hasAudioRecordingsForSelectedTimePeriod"
    >
      Locations summary
    </h2>
    <horizontal-overflow-carousel
      v-if="hasAudioRecordingsForSelectedTimePeriod"
      class="locations-summary-wrapper mb-3 mb-lg-4"
    >
      <!--   TODO - Media breakpoint at which the carousel stops being a carousel? -->
      <div
        class="species-summary-thermal d-flex gap-3 flex-sm-nowrap mb-3 mb-sm-0"
        v-if="!isLoading && hasAudioRecordingsForSelectedTimePeriod"
      >
        <!--        FIXME: Need to filter to just locations that were recording birds during the period -->
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
      v-if="isLoading || !hasAudioRecordingsForSelectedTimePeriod"
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
                displayMode: ActivitySearchDisplayMode.Recordings,
                recordingMode: ActivitySearchRecordingMode.Audio,
              },
            }"
            >View latest bird detections</b-button
          >
        </div>
      </div>
    </div>
  </div>
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
.dashboard-scope-type {
  @media screen and (min-width: @breakpoint-md) {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    margin-top: -70px;
  }
  @media screen and (min-width: @breakpoint-xxl) {
    margin-top: -84px;
  }
}

.dashboard-scope-time {
  @media screen and (min-width: @breakpoint-md) {
    position: absolute;
    right: 0;
    margin-top: -70px;
  }
  @media screen and (min-width: @breakpoint-xxl) {
    margin-top: -84px;
  }
  .filters {
    .form-select {
      background-color: unset;
      border: 0;
      width: auto;
      margin-right: -12px;
    }
    span {
      white-space: nowrap;
    }
  }
}

.dashboard-subhead {
  margin-bottom: var(--cp-spacing-md);
  font-size: var(--cp-font-size-h4);
  @media screen and (max-width: @breakpoint-sm-max) {
    margin-top: var(--cp-spacing-xs);
  }
}

.species-summary-container-thermal {
  border-radius: var(--bs-border-radius);
  @media screen and (min-width: @breakpoint-sm) {
    background: var(--bs-white);
    .standard-shadow();
  }
}

/****** Thermal *******/

.species-summary-thermal {
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

/****** Audio *******/

.species-summary-container-audio {
  .detections-bar {
    height: var(--cp-spacing-xs);
    background: var(--cp-color-green-400);
  }
  .locations-chart {
    width: var(--cp-spacing-md);
    height: var(--cp-spacing-md);
  }
}

.featured_species_container {
  @media (min-width: @breakpoint-lg-max) {
    max-width: 84%;
  }
}

.featured-species {
  // See https://en.wikipedia.org/wiki/IUCN_Red_List#Categories
  // We'll use the same color scheme Wikipedia is using
  &__rank {
    display: none;
    @media (min-width: @breakpoint-xs-max) {
      display: block;
      line-height: 0.9;
    }
    @media (min-width: @breakpoint-xs-max) and (max-width: @breakpoint-sm-max) {
      font-size: 3rem;
    }
    @media (min-width: @breakpoint-sm-max) {
      display: block;
      font-size: 5.5rem;
      line-height: 0.9;
    }
  }
}

// See https://en.wikipedia.org/wiki/IUCN_Red_List#Categories
// We'll use the same color scheme Wikipedia is using
.conservation-status {
  &.mini {
    font-size: var(--cp-font-size-sm);
    font-weight: var(--cp-font-weight-semilbold);
    width: var(--cp-spacing-xl);
    height: var(--cp-spacing-xl);
    text-transform: uppercase;
  }
  color: var(--bs-white);
  // important used because of the badge colors also using it 🙃
  &.ex {
    background: var(--bs-black) !important;
    color: var(--bs-red) !important;
  }
  // extinct in the wild
  &.ew {
    background: var(--bs-black) !important;
  }
  // critically endangered
  &.cr {
    background: var(--bs-red) !important;
  }
  // endangered
  &.en {
    background: #cc6633 !important;
  }
  // vulnerable
  &.vu {
    background: #cc9900 !important;
  }
  // near threatened
  &.nt {
    background: #369f00 !important;
  }
  // least concern
  &.lc {
    background: #057339 !important;
  }
}

.biostatus {
  &.endemic {
    background: var(--cp-color-green-100) !important;
    color: var(--cp-color-green-700) !important;
  }
  &.naturalised {
    background: color-mix(in oklch, var(--bs-teal), transparent 80%) !important;
    color: color-mix(in oklch, var(--bs-teal), #000 30%) !important;
  }
  &.introduced {
    background: color-mix(in oklch, var(--bs-cyan), transparent 80%) !important;
    color: color-mix(in oklch, var(--bs-cyan), #000 30%) !important;
  }
}
</style>
<style lang="less">
@import "../assets/less/breakpoints.less";
// make sure that the shadow of the species summary displays
@media screen and (max-width: @breakpoint-xs-max) {
  .species-summary-container-thermal {
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

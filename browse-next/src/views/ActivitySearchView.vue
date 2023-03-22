<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import type { ComputedRef, Ref } from "vue";
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUpdated,
  provide,
  ref,
  watch,
} from "vue";
import type { NamedPoint } from "@models/mapUtils";
import MapWithPoints from "@/components/MapWithPoints.vue";
import Multiselect from "@vueform/multiselect";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import Datepicker from "@vuepic/vue-datepicker";
import { getLocationsForProject } from "@api/Project";
import {
  activeLocations,
  currentSelectedProject as currentActiveProject,
  latLngForActiveLocations,
  userProjects,
} from "@models/provides";
import type { SelectedProject } from "@models/LoggedInUser";
import type { LoadedResource } from "@api/types";
import { RecordingLabels } from "@/consts";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import ImageLoader from "@/components/ImageLoader.vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { longRunningQuery, queryRecordingsInProject } from "@api/Recording";
import { RecordingType, TagMode } from "@typedefs/api/consts.ts";
import type { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import type {
  RecordingId,
  StationId as LocationId,
} from "@typedefs/api/common";
import InlineViewModal from "@/components/InlineViewModal.vue";
import {
  useElementBounding,
  useIntersectionObserver,
  useWindowSize,
} from "@vueuse/core";
import type { MaybeElement } from "@vueuse/core";
import { DateTime } from "luxon";
import {
  timezoneForLatLng,
  formatDuration,
  timeAtLocation,
} from "@models/visitsUtils";
import { canonicalLatLngForLocations } from "../helpers/Location";
import { API_ROOT } from "@api/root";
import * as sunCalc from "suncalc";
import {
  displayLabelForClassificationLabel,
  getClassifications,
} from "@api/Classifications";
import { useRoute, useRouter } from "vue-router";

const mapBuffer = ref<HTMLDivElement>();
const searchContainer = ref<HTMLDivElement>();

const { right: searchContainerRight, top: searchContainerTop } =
  useElementBounding(searchContainer);
const { height: windowHeight } = useWindowSize();
const setMapBufferWidth = (parentElRight: number) => {
  if (mapBuffer.value) {
    const right = window.innerWidth - parentElRight;
    mapBuffer.value.style.width = `${Math.max(0, 500 - right)}px`;
  }
};
const setSearchContainerHeight = (winHeight: number) => {
  if (searchContainer.value) {
    //searchContainer.value.style.height = `${windowHeight.value - searchContainerTop.value}px`;
  }
};
watch(searchContainerRight, setMapBufferWidth);
watch(windowHeight, setSearchContainerHeight);

const currentProject = inject(currentActiveProject) as ComputedRef<
  SelectedProject | false
>;
const availableProjects = inject(userProjects) as Ref<
  LoadedResource<ApiProjectResponse[]>
>;
const currentSelectedProject = computed<ApiProjectResponse | null>(() => {
  if (currentProject.value && availableProjects.value) {
    const project = availableProjects.value.find(
      ({ id }) => id === (currentProject.value as SelectedProject).id
    );
    return project || null;
  }
  return null;
});

const projectHasAudio = computed<boolean>(() => {
  return (
    !!currentSelectedProject.value &&
    !!currentSelectedProject.value.lastAudioRecordingTime
  );
});

const projectHasCameras = computed<boolean>(() => {
  return (
    !!currentSelectedProject.value &&
    !!currentSelectedProject.value.lastThermalRecordingTime
  );
});

const projectHasAudioAndThermal = computed<boolean>(() => {
  return projectHasAudio.value && projectHasCameras.value;
});

const locations = ref<LoadedResource<ApiLocationResponse[]>>(null);
const availableLabels = computed(() => {
  const labels = RecordingLabels.slice(2).map(
    ({ text, description, value }) => ({
      label: text,
      value: (value || text).toLowerCase(),
    })
  );
  if (selectedCoolLabel.value) {
    const label = RecordingLabels[0];
    labels.push({
      label: label.text,
      value: (label.value || label.text).toLowerCase(),
    });
  }
  if (selectedFlaggedLabel.value) {
    const label = RecordingLabels[1];
    labels.push({
      label: label.text,
      value: (label.value || label.text).toLowerCase(),
    });
  }
  return labels;
});

const selectedLabels = ref<string[]>([]);

const now = new Date();
const oneDayAgo = new Date(new Date().setDate(now.getDate() - 1));
//oneDayAgo.setHours(0, 0, 0, 0);
const threeDaysAgo = new Date(new Date().setDate(now.getDate() - 3));
//threeDaysAgo.setHours()
const oneWeekAgo = new Date(new Date().setDate(now.getDate() - 7));
const oneMonthAgo = new Date(new Date().setMonth(now.getMonth() - 1));
const threeMonthsAgo = new Date(new Date().setMonth(now.getMonth() - 3));
const oneYearAgo = new Date(new Date().setFullYear(now.getFullYear() - 1));
const lastTwentyFourHours: [Date, Date] = [oneDayAgo, now];

const searchIsValid = computed<boolean>(() => {
  const hasValidDateRange =
    Array.isArray(selectedDateRange.value) ||
    Array.isArray(customDateRange.value);
  const hasAdvancedSettingsSelected = showAdvanced.value;
  if (!hasAdvancedSettingsSelected) {
    return hasValidDateRange && selectedLocations.value.length !== 0;
  }

  // Make sure we have a valid state
  return false;
});

const dateRangePicker = ref<typeof Datepicker>();
const selectedDateRange = ref<[Date, Date] | "custom">(lastTwentyFourHours);
const customDateRange = ref<[Date, Date] | null>(null);
const combinedDateRange = computed<[Date, Date]>(() => {
  if (selectedDateRange.value === "custom") {
    if (customDateRange.value) {
      // Make custom range be from beginning of start date til end of end date.
      // const start = DateTime.fromJSDate(new Date(customDateRange.value[0]), {
      //   zone: timezoneForProject.value,
      // })
      //   .set({
      //     hour: 0,
      //     minute: 0,
      //     second: 0,
      //     millisecond: 0,
      //   })
      //   .toJSDate();
      // const end = DateTime.fromJSDate(new Date(customDateRange.value[1]), {
      //   zone: timezoneForProject.value,
      // })
      //   .set({
      //     hour: 23,
      //     minute: 59,
      //     second: 59,
      //     millisecond: 999,
      //   })
      //   .toJSDate();
      const start = new Date(customDateRange.value[0]);
      const end = new Date(customDateRange.value[1]);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return [start, end];
    }
    return customDateRange.value || [new Date(), new Date()];
  } else {
    return selectedDateRange.value;
  }
});

let customAutomaticallySet = false;
const maybeSelectDatePicker = (value: [Date, Date] | string) => {
  if (value === "custom" && !customAutomaticallySet) {
    nextTick(() => {
      if (dateRangePicker.value) {
        dateRangePicker.value.openMenu();
      }
    });
  } else if (customAutomaticallySet) {
    customAutomaticallySet = false;
  }
};

const mapLocationForMap = (location: ApiLocationResponse): NamedPoint => {
  return {
    location: location.location,
    type: "station",
    project: (currentProject.value as SelectedProject).groupName,
    name: location.name,
    id: location.id,
  };
};

const getLatestDateForLocation = (
  location: ApiLocationResponse
): Date | null => {
  if (recordingMode.value === "cameras") {
    return (
      (location.lastThermalRecordingTime &&
        new Date(location.lastThermalRecordingTime)) ||
      null
    );
  } else if (recordingMode.value === "audio") {
    return (
      (location.lastAudioRecordingTime &&
        new Date(location.lastAudioRecordingTime)) ||
      null
    );
  }
  return null;
};

const locationHasRecordings = (location: ApiLocationResponse) => {
  if (recordingMode.value === "audio") {
    return !!location.lastAudioRecordingTime;
  } else if (recordingMode.value === "cameras") {
    return !!location.lastThermalRecordingTime;
  }
  return !!(
    location.lastAudioRecordingTime || location.lastThermalRecordingTime
  );
};

const locationsForMap = computed<NamedPoint[]>(() => {
  if (locations.value) {
    return locations.value
      .filter(
        (location) =>
          locationHasRecordings(location) &&
          location.location &&
          (location.location.lat !== 0 || location.location.lng !== 0)
      )
      .map(mapLocationForMap);
  }
  return [];
});
const highlightedPoint = computed<NamedPoint | null>(() => {
  return (
    (locationsForMap.value || []).find(
      (p) => p.id === currentlyHighlightedLocation.value
    ) || null
  );
});

const recordingMode = ref<"cameras" | "audio">("cameras");

watch(recordingMode, (nextMode) => {
  // If the selected date range no longer applies to the current mode, reset it.
  if (
    combinedDateRange.value[0] < minDateForProject.value ||
    combinedDateRange.value[1] > maxDateForProject.value
  ) {
    console.warn("Should adjust range");
    selectedDateRange.value = commonDateRanges.value[0].value;
    customDateRange.value = null;
  }
});
const selectedLocations = ref<(ApiLocationResponse | "any")[]>(["any"]);

const locationsInSelectedTimespan = computed<ApiLocationResponse[]>(() => {
  if (locations.value) {
    return locations.value.filter((location) => {
      if (location.location.lat === 0 && location.location.lng === 0) {
        return false;
      }
      const latestDateForLocation = getLatestDateForLocation(location);
      return (
        latestDateForLocation &&
        latestDateForLocation >= combinedDateRange.value[0] &&
        new Date(location.activeAt) <= combinedDateRange.value[1]
      );
    });
  }
  return [];
});
const onChangeLocationsSelect = (
  value: (ApiLocationResponse | "any")[],
  select: Multiselect
) => {
  if (!optionsRemapping.value) {
    if (value.length > 1) {
      nextTick(() => {
        const hasAny = selectedLocations.value.indexOf("any");
        if (hasAny >= 0) {
          selectedLocations.value.splice(hasAny, 1);
          remapLocationOptions(locationsInSelectedTimespanOptions.value);
        }
      });
    } else if (value.length === 0) {
      nextTick(() => {
        selectedLocations.value = ["any"];
      });
    }
  }
};

const locationsInSelectedTimespanForMap = computed<NamedPoint[]>(() => {
  return locationsInSelectedTimespan.value
    .filter((location) => {
      // Locations filtered by selected locations.
      if (selectedLocations.value.length) {
        if (selectedLocations.value.includes("any")) {
          return true;
        } else {
          return !!selectedLocations.value.find(
            (selectedLocation: ApiLocationResponse | "any") => {
              return (
                (selectedLocation as ApiLocationResponse).id === location.id
              );
            }
          );
        }
      }
    })
    .map(mapLocationForMap);
});

const locationsInSelectedTimespanOptions = computed<
  { value: ApiLocationResponse | "any"; label: string }[]
>(() => {
  return [
    { value: "any", label: "Any location", disabled: true },
    ...locationsInSelectedTimespan.value.map((location) => ({
      value: location,
      label: location.name,
    })),
  ];
});

const selectedLocationsSelect = ref<Multiselect>();
const optionsInited = ref<boolean>(false);
const optionsRemapping = ref<boolean>(false);
const remapLocationOptions = (
  nextOptions: {
    value: "any" | ApiLocationResponse;
    label: string;
    disabled?: boolean;
  }[]
) => {
  // If this changed, we need to remap the selected locations to the existing
  // locations.
  const selected = [...selectedLocations.value];
  nextTick(() => {
    if (optionsInited.value) {
      optionsRemapping.value = true;
      if (selectedLocationsSelect.value) {
        (selectedLocationsSelect.value as any).clear();
        for (const item of selected) {
          if (item === "any") {
            (selectedLocationsSelect.value as any).select(nextOptions[0]);
          } else {
            const match = nextOptions.find(
              (option) =>
                (option.value as ApiLocationResponse).id &&
                (option.value as ApiLocationResponse).id === item.id
            );
            if (match) {
              (selectedLocationsSelect.value as any).select(match);
            }
          }
        }
      }
      if (selectedLocations.value.length === 0) {
        (selectedLocationsSelect.value as any).select(nextOptions[0]);
      }
      optionsRemapping.value = false;
    } else {
      optionsInited.value = true;
    }
  });
};
watch(locationsInSelectedTimespanOptions, remapLocationOptions);

const minDateForProject = computed<Date>(() => {
  // Earliest active location
  let earliest = new Date();
  if (locations.value) {
    for (const location of locations.value) {
      const activeAt = new Date(location.activeAt);
      if (activeAt < earliest) {
        earliest = activeAt;
      }
    }
  }
  return earliest;
});

const minDateForSelectedLocations = computed<Date>(() => {
  // Earliest active location
  if (selectedLocations.value.includes("any")) {
    // FIXME - All these setting of dates to midnight needs to be localised to local time.
    const min = new Date(minDateForProject.value);
    //min.setHours(0, 0, 0, 0);
    return min;
  }
  let earliest = new Date();
  if (selectedLocations.value) {
    for (const location of selectedLocations.value) {
      const activeAt = new Date((location as ApiLocationResponse).activeAt);
      //activeAt.setHours(0, 0, 0, 0);
      if (activeAt < earliest) {
        earliest = activeAt;
      }
    }
  }
  return earliest;
});

const maxDateForProject = computed<Date>(() => {
  // Latest active location
  let latest = new Date();
  latest.setFullYear(2010);
  if (locations.value) {
    for (const location of locations.value) {
      const latestDateForLocation = getLatestDateForLocation(location);
      if (latestDateForLocation && latestDateForLocation > latest) {
        latest = latestDateForLocation;
      }
    }
  }
  return latest;
});

const maxDateForSelectedLocations = computed<Date>(() => {
  if (selectedLocations.value.includes("any")) {
    return maxDateForProject.value;
  }
  // Latest active location
  let latest = new Date();
  latest.setFullYear(2010);
  if (selectedLocations.value) {
    for (const location of selectedLocations.value) {
      const latestDateForLocation = getLatestDateForLocation(
        location as ApiLocationResponse
      );
      if (latestDateForLocation && latestDateForLocation > latest) {
        latest = latestDateForLocation;
      }
    }
  }
  return latest;
});

const maxDateForProjectMinusTwoWeeks = computed<Date>(() => {
  const max = new Date(maxDateForProject.value);
  max.setDate(max.getDate() - 14);
  return new Date(max);
});

const maxDateForSelectedLocationsMinusTwoWeeks = computed<Date>(() => {
  const max = new Date(maxDateForSelectedLocations.value);
  max.setDate(max.getDate() - 14);
  return new Date(max);
});
const highlightPoint = (point: NamedPoint) => {
  //
};
const canonicalLatLngForActiveLocations = canonicalLatLngForLocations(
  locationsInSelectedTimespan
);

const timezoneForProject = computed<string>(() => {
  return timezoneForLatLng(canonicalLatLngForActiveLocations.value);
});

const commonDateRanges = computed<
  { value: [Date, Date] | "custom"; label: string }[]
>(() => {
  const earliest = minDateForProject.value;
  const latest = maxDateForProject.value;
  const ranges = [];
  if (earliest < oneDayAgo && latest > oneDayAgo) {
    ranges.push({
      label: "Last 24 hours",
      value: lastTwentyFourHours,
    });
  }
  if (earliest < threeDaysAgo && latest > threeDaysAgo) {
    ranges.push({
      label: "Last 3 days",
      value: [threeDaysAgo, now],
    });
  }
  if (earliest < oneWeekAgo && latest > oneWeekAgo) {
    ranges.push({
      label: "Last week",
      value: [oneWeekAgo, now],
    });
  }
  if (earliest < oneMonthAgo && latest > oneMonthAgo) {
    ranges.push({
      label: "Last month",
      value: [oneMonthAgo, now],
    });
  }
  if (earliest < threeMonthsAgo && latest > threeMonthsAgo) {
    ranges.push({
      label: "Last 3 months",
      value: [threeMonthsAgo, now],
    });
  }
  if (earliest < oneYearAgo && latest > oneYearAgo) {
    ranges.push({
      label: "Last year",
      value: [oneYearAgo, now],
    });
  }
  ranges.push(
    {
      label: "Any time",
      value: [earliest, now],
    },
    {
      label: "Custom date range",
      value: "custom",
    }
  );
  return ranges as { value: [Date, Date] | "custom"; label: string }[];
});

const displayMode = ref<"visits" | "recordings">("recordings");

const taggedBy = ref<("AI" | "human")[]>([]);
const taggedByOptions = [
  {
    text: "Human",
    value: TagMode.HumanTagged,
  },
  {
    text: "A.I.",
    value: TagMode.AutomaticallyTagged,
  },
];

const exclusiveTagOptions = [
  {
    text: "Only A.I.",
    value: TagMode.AutomaticOnly,
  },
  {
    text: "Untagged", // Are there any actual untagged tracks?
    value: TagMode.UnTagged,
  },
  {
    text: "Only Human", // Are there any with only human tags?
    value: TagMode.HumanOnly,
  },
  {
    text: "Untagged by Humans",
    value: TagMode.NoHuman, // Untagged or ai tagged
  },
  {
    text: "Tagged by both",
    value: TagMode.AutomaticHuman,
  },
];

const includeSubSpeciesTags = ref<boolean>(true);
const selectedTags = ref<string[]>([]);

const loadedRecordings = ref<ApiRecordingResponse[]>([]);
const loadedRecordingIds = ref<RecordingId[]>([]);

const canLoadMoreRecordingsInPast = computed<boolean>(() => {
  return currentObserver !== null;
});

const loadMoreRecordingsInPast = () => {
  currentObserver && currentObserver.stop();
  currentObserver = null;
  doSearch();
};
const currentTotalRecordings = computed<number>(() => {
  if (currentQueryCount.value) {
    return currentQueryCount.value;
  }
  return loadedRecordings.value.length;
});
const canExpandSearchBackFurther = computed<boolean>(() => {
  return (
    currentQueryCursor.value.fromDateTime.getTime() !==
    minDateForSelectedLocations.value.getTime()
  );
});
const updatedRecording = (recording: ApiRecordingResponse) => {
  const loadedRecording = loadedRecordings.value.find(
    ({ id }) => id === recording.id
  );
  if (loadedRecording) {
    loadedRecording.tracks = recording.tracks;
    loadedRecording.tags = recording.tags;
  }
};

provide(activeLocations, locationsInSelectedTimespan);
provide(latLngForActiveLocations, canonicalLatLngForActiveLocations);
provide("loadedRecordingIds", loadedRecordingIds);
provide("currentRecordingCount", currentTotalRecordings);
provide("canLoadMoreRecordingsInPast", canLoadMoreRecordingsInPast);
provide("updatedRecording", updatedRecording);

provide("requestLoadMoreRecordingsInPast", () => loadMoreRecordingsInPast());

// TODO: Nice to have - allow expanding the current search range when we reach the end of the list of recordings.
provide("canExpandCurrentQueryInPast", canExpandSearchBackFurther);
type RecordingItem = { type: "recording"; data: ApiRecordingResponse };
type SunItem = { type: "sunset" | "sunrise"; data: string };
// Chunk recordings into days and hours.
// Do we want to insert sunrise and sunset?  Probably.
const chunkedRecordings = ref<
  {
    dateTime: DateTime;
    items: (RecordingItem | SunItem)[];
  }[]
>([]);

const format = (dates: Date[]) => {
  return dates
    .map((date) => {
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();

      return `${day}/${month}/${year}`;
    })
    .join(" - ");
};

const loading = ref<boolean>(false);
const showAdvanced = ref<boolean>(false);

onMounted(async () => {
  setSearchContainerHeight(windowHeight.value);
  loading.value = true;
  if (currentProject.value) {
    // TODO: This could be provided for group at a higher level.
    locations.value = await getLocationsForProject(
      currentProject.value.id.toString(),
      true
    );
    selectedDateRange.value = commonDateRanges.value[0].value;

    await doSearch();
  }
  loading.value = false;
});

const getVisitsForCurrentQuery = async () => {
  // Fetch visits in time-range, optionally filtered on one or more animal tags.
};

interface RecordingQueryCursor {
  fromDateTime: Date;
  untilDateTime: Date;
}

const currentQueryHash = ref<string>("");
const currentQueryCursor = ref<RecordingQueryCursor>({
  fromDateTime: new Date(),
  untilDateTime: new Date(),
});
const currentQueryCount = ref<LoadedResource<number>>(null);
const currentQueryLoaded = ref<number>(0);
const completedCurrentQuery = ref<boolean>(false);

let needsObserverUpdate = false;
watch(loadedRecordings.value, () => {
  needsObserverUpdate = true;
});

let currentObserver: { stop: () => void } | null;

onUpdated(() => {
  if (needsObserverUpdate) {
    let nearLast = document.querySelector(
      ".day-container:last-child > .list-item:nth-last-child(3)"
    );
    if (!nearLast) {
      nearLast = document.querySelector(
        ".day-container:last-child > .list-item:nth-last-child(2)"
      );
    }
    if (!nearLast) {
      nearLast = document.querySelector(
        ".day-container:last-child > .list-item:last-child"
      );
    }
    if (nearLast) {
      // Check if it's already visible.

      const bounds = nearLast.getBoundingClientRect();
      if (bounds.top >= 0 && bounds.top <= windowHeight.value) {
        // FIXME - shouldn't do this automatically, (extend search)
        if (canExpandSearchBackFurther.value) {
          console.log("load more (2)");
          nextTick(() => doSearch());
        }
      } else {
        // Observe when this element comes into view.
        currentObserver = useIntersectionObserver(
          ref(nearLast as MaybeElement),
          (intersections: IntersectionObserverEntry[]) => {
            for (const intersection of intersections) {
              if (intersection.isIntersecting) {
                console.log("load more");
                doSearch();
                currentObserver && currentObserver.stop();
                currentObserver = null;
                break;
              }
            }
          }
        );
      }
    } else {
      console.warn("Failed to get observation item");
    }
    needsObserverUpdate = false;
  }
});

const getCurrentQueryHash = () => {
  const untilDateTime = combinedDateRange.value[1];
  // Keep track of the recordingState/cursor using a hash of the query,
  const isAnyLocation = selectedLocations.value[0] === "any";
  // const locations = isAnyLocation
  //   ? locationsInSelectedTimespan.value.map((loc) => loc.id)
  //   : selectedLocations.value.map((loc) => (loc as ApiLocationResponse).id);
  const query = {
    type:
      recordingMode.value === "cameras"
        ? RecordingType.ThermalRaw // TODO: Modify to include all camera types
        : RecordingType.Audio,
  };
  if (!isAnyLocation) {
    (query as any).locations = selectedLocations.value.map(
      (loc) => (loc as ApiLocationResponse).id
    );
  }
  const fromDateTime = combinedDateRange.value[0];
  const queryHash = JSON.stringify({
    ...query,
    fromDateTime,
    untilDateTime,
  });
  return queryHash;
};

// NOTE: We try to load at most one month at a time.
const getRecordingsForCurrentQuery = async () => {
  // TODO: Make earliest part of range be on a midnight boundary in the current timezone.

  if (currentProject.value) {
    // TODO: Dedupe code
    const untilDateTime = combinedDateRange.value[1];
    // Keep track of the recordingState/cursor using a hash of the query,
    const query = {
      type:
        recordingMode.value === "cameras"
          ? RecordingType.ThermalRaw // TODO: Modify to include all camera types
          : RecordingType.Audio,
    };
    if (selectedLocations.value[0] !== "any") {
      (query as any).locations = selectedLocations.value.map(
        (loc) => (loc as ApiLocationResponse).id
      );
    }
    const fromDateTime = combinedDateRange.value[0];
    const queryHash = getCurrentQueryHash();
    if (queryHash !== currentQueryHash.value) {
      while (loadedRecordings.value.length) {
        loadedRecordings.value.pop();
      }
      while (loadedRecordingIds.value.length) {
        loadedRecordingIds.value.pop();
      }
      while (chunkedRecordings.value.length) {
        chunkedRecordings.value.pop();
      }
      currentQueryHash.value = queryHash;
      currentQueryLoaded.value = 0;
      completedCurrentQuery.value = false;
      // NOTE: If it's the first load for a given query, lazily get the count as a separate query.
      // TODO Also, make it abortable if we change queries.
      currentQueryCount.value = undefined;
      currentQueryCursor.value = {
        fromDateTime,
        untilDateTime,
      };
      queryRecordingsInProject(currentProject.value.id, {
        ...query,
        limit: 1,
        countAll: true,
        fromDateTime,
        untilDateTime,
      }).then((response) => {
        if (response.success) {
          currentQueryCount.value = response.result.count;
        } else {
          currentQueryCount.value = null;
        }
      });
    }
    if (
      currentQueryCursor.value.fromDateTime <
      currentQueryCursor.value.untilDateTime
    ) {
      // console.log("Count all", queryMap[key].loaded === 0);
      // First time through, we want to count all for a given timespan query.
      const twoPagesWorth = Math.ceil(windowHeight.value / 80) * 2;
      const recordingsResponse = await queryRecordingsInProject(
        currentProject.value.id,
        {
          ...query,
          limit: twoPagesWorth,
          fromDateTime: currentQueryCursor.value.fromDateTime,
          untilDateTime: currentQueryCursor.value.untilDateTime,
        }
      );
      if (recordingsResponse.success) {
        const rows = recordingsResponse.result.rows;

        loadedRecordings.value.push(...rows);
        loadedRecordingIds.value.push(...rows.map(({ id }) => id));
        // TODO: Insert sunrise/sunset times.
        for (const recording of rows) {
          // Get the location local day:
          if (recording.location) {
            const recordingDate = new Date(recording.recordingDateTime);
            const dateTime = DateTime.fromJSDate(recordingDate, {
              zone: timezoneForLatLng(recording.location),
            });

            const { sunrise, sunset } = sunCalc.getTimes(
              recordingDate,
              canonicalLatLngForActiveLocations.value.lat,
              canonicalLatLngForActiveLocations.value.lng
            );

            let prevDay;
            if (chunkedRecordings.value.length !== 0) {
              prevDay =
                chunkedRecordings.value[chunkedRecordings.value.length - 1];
            }
            if (
              !prevDay ||
              (prevDay &&
                prevDay.dateTime.toFormat("dd/MM/yyyy") !==
                  dateTime.toFormat("dd/MM/yyyy"))
            ) {
              chunkedRecordings.value.push({
                dateTime,
                items: [],
              });
            }
            prevDay =
              chunkedRecordings.value[chunkedRecordings.value.length - 1];
            let prevItem;
            if (prevDay.items.length) {
              prevItem = prevDay.items[prevDay.items.length - 1];
            }
            if (prevItem && prevItem.type === "recording") {
              // See if we can insert sunset/rise
              if (
                sunrise < new Date(prevItem.data.recordingDateTime) &&
                sunrise > recordingDate
              ) {
                prevDay.items.push({
                  type: "sunrise",
                  data: sunrise.toISOString(),
                });
              }
              if (
                sunset < new Date(prevItem.data.recordingDateTime) &&
                sunset > recordingDate
              ) {
                prevDay.items.push({
                  type: "sunset",
                  data: sunset.toISOString(),
                });
              }
            }
            prevDay.items.push({
              type: "recording",
              data: recording,
            });
          }
        }
        // Increment the cursor.
        currentQueryLoaded.value += rows.length;
        if (rows.length) {
          const gotUntilDate = new Date(
            rows[rows.length - 1].recordingDateTime
          );
          gotUntilDate.setMilliseconds(gotUntilDate.getMilliseconds() - 1);
          currentQueryCursor.value.untilDateTime = new Date(
            gotUntilDate.setMilliseconds(gotUntilDate.getMilliseconds() - 1)
          );
          if (
            recordingsResponse.result.count < recordingsResponse.result.limit
          ) {
            if (
              currentQueryCursor.value.fromDateTime.getTime() ===
              minDateForSelectedLocations.value.getTime()
            ) {
              console.log("!!! stopping any observers");
              currentObserver && currentObserver.stop();
              currentObserver = null;
              // We're at the limit
            } else {
              // We're at the end of the current time range, but can expand it back further
              currentQueryCursor.value.fromDateTime = new Date(
                currentQueryCursor.value.untilDateTime
              );
            }
            completedCurrentQuery.value = true;
          }
        } else {
          currentQueryCursor.value.fromDateTime = new Date(
            currentQueryCursor.value.untilDateTime
          );
          completedCurrentQuery.value = true;
        }
      }
    }
  }
};

const searching = ref<boolean>(false);
const doSearch = async () => {
  searching.value = true;
  await getClassifications();
  if (displayMode.value === "visits") {
    await getVisitsForCurrentQuery();
  } else if (displayMode.value === "recordings") {
    await getRecordingsForCurrentQuery();
  }
  searching.value = false;
};

const exporting = ref<boolean>(false);
const doExport = async () => {
  exporting.value = true;
  // TODO
  // if (displayMode.value === "visits") {
  //   await getVisitsForCurrentQuery();
  // } else if (displayMode.value === "recordings") {
  //   await getRecordingsForCurrentQuery();
  // }
  exporting.value = false;
};

const showFilteredRecordings = ref<boolean>(false);

const FLAG = "requires review";
const COOL = "cool";
const selectedLabelGetterSetter = (label: string) => ({
  get: () => {
    return selectedLabels.value.includes(label);
  },
  set: (val: boolean) => {
    if (val && !selectedLabels.value.includes(label)) {
      selectedLabels.value.push(label);
    } else {
      selectedLabels.value.splice(selectedLabels.value.indexOf(label), 1);
    }
  },
});

const selectedFlaggedLabel = computed<boolean>(selectedLabelGetterSetter(FLAG));
const selectedCoolLabel = computed<boolean>(selectedLabelGetterSetter(COOL));

const selectedOtherLabels = ref<boolean>(false);
const allPredatorLabels = ["mustelid", "possum", "cat", "rodent", "hedgehog"];
const allPredators = computed<boolean>({
  get: () => {
    for (const label of allPredatorLabels) {
      if (!selectedTags.value.includes(label)) {
        return false;
      }
    }
    return true;
  },
  set: (val: boolean) => {
    if (val) {
      const newTags = [];
      for (const label of allPredatorLabels) {
        if (!selectedTags.value.includes(label)) {
          newTags.push(label);
        }
      }
      if (newTags.length) {
        selectedTags.value = [...selectedTags.value, ...newTags];
      }
    } else {
      selectedTags.value = selectedTags.value.filter(
        (label) => !allPredatorLabels.includes(label)
      );
    }
  },
});
const somePredatorsSelected = computed<boolean>(() => {
  const onlyPredators = selectedTags.value.filter((label) =>
    allPredatorLabels.includes(label)
  );
  return (
    onlyPredators.length !== 0 &&
    onlyPredators.length !== allPredatorLabels.length
  );
});
const maybeUnselectedOtherLabels = (val: boolean) => {
  if (!val) {
    selectedLabels.value = selectedLabels.value.filter(
      (item) => item === COOL || item === FLAG
    );
  }
};

const fromDateMinusIncrement = computed<Date>(() => {
  // What was the selected increment?  One day? One month?  One year?
  // Use that initial increment to expand search backwards in time by that amount.
  const fromDateTime = new Date(combinedDateRange.value[0]);
  const from = Math.max(
    minDateForSelectedLocations.value.getTime(),
    fromDateTime.setMonth(fromDateTime.getMonth() - 1)
  );
  return new Date(from);
});

const relativeTimeIncrementInPast = computed<string>(() => {
  if (
    fromDateMinusIncrement.value.getTime() ===
    minDateForSelectedLocations.value.getTime()
  ) {
    return "the earliest available date for this selection";
  }
  // TODO: Make sure the relative time has changed from the previous.
  return DateTime.fromJSDate(
    fromDateMinusIncrement.value
  ).toRelative() as string;
});

const route = useRoute();
const currentlySelectedRecording = computed<RecordingId | null>(
  () =>
    (route.params.currentRecordingId &&
      Number(route.params.currentRecordingId)) ||
    null
);

// TODO: Load offset date from url params, and have the ability to also scroll upwards and load more,
//  as well as expand the search forwards in time.

const adjustTimespanBackwards = () => {
  // FIXME - when we adjust the timespan backwards, we need to make sure we keep the existing
  //  locations selection.

  if (selectedDateRange.value === "custom") {
    if (customDateRange.value) {
      customDateRange.value[0] = fromDateMinusIncrement.value;
    } else {
      // Error
    }
  } else {
    // Fixme: this is wrong?
    const initialSelectedDateRangeUntil = new Date(selectedDateRange.value[1]);
    customAutomaticallySet = true;
    selectedDateRange.value = "custom";
    if (customDateRange.value) {
      customDateRange.value[0] = fromDateMinusIncrement.value;
    } else {
      customDateRange.value = [
        fromDateMinusIncrement.value,
        initialSelectedDateRangeUntil,
      ];
    }
  }
  // console.log("Cursor was", JSON.stringify(currentQueryCursor.value, null, '\t'));
  currentQueryCursor.value.fromDateTime = fromDateMinusIncrement.value;
  // Reset the key, so that we continue the current search
  currentQueryHash.value = getCurrentQueryHash();
  //console.log("Cursor is now", JSON.stringify(currentQueryCursor.value, null, '\t'));

  // TODO - When we expand a search, we need to issue another count request for the span added, so we
  // can update the total.
  doSearch();
};
const router = useRouter();

const selectedRecording = (recording: SunItem | RecordingItem) => {
  if (recording.type === "recording") {
    router.push({
      name: "activity-recording",
      params: {
        currentRecordingId: (recording as RecordingItem).data.id,
      },
    });
  }
};
const currentlyHighlightedLocation = ref<LocationId | null>(null);

const highlightedLocation = (item: RecordingItem | SunItem) => {
  if (item.type === "recording") {
    currentlyHighlightedLocation.value = (item.data as ApiRecordingResponse)
      .stationId as number;
  }
};
const unhighlightedLocation = (item: RecordingItem | SunItem) => {
  if (
    item.type === "recording" &&
    currentlyHighlightedLocation.value ===
      (item.data as ApiRecordingResponse).stationId
  ) {
    currentlyHighlightedLocation.value = null;
  }
};

const thumbnailSrcForRecording = (recording: ApiRecordingResponse): string => {
  return `${API_ROOT}/api/v1/recordings/${recording.id}/thumbnail`;
};

interface TagItem {
  human?: boolean;
  automatic?: boolean;
  what: string;
  path?: string;
  displayName: string;
}
const tagsForRecording = (recording: ApiRecordingResponse): TagItem[] => {
  // Get unique tags for recording, and compile the taggers.
  const uniqueTags: Record<string, TagItem> = {};
  for (const track of recording.tracks) {
    const uniqueTrackTags: Record<string, TagItem> = {};
    let isHumanTagged = false;
    for (const tag of track.tags) {
      uniqueTrackTags[tag.what] = uniqueTrackTags[tag.what] || {
        human: false,
        automatic: false,
        what: tag.what,
        path: tag.path,
        displayName: tag.what,
      };
      const existingTag = uniqueTrackTags[tag.what];
      if (!existingTag.human && !tag.automatic) {
        isHumanTagged = true;
        existingTag.human = !tag.automatic;
      }
      if (!existingTag.automatic && tag.automatic) {
        existingTag.automatic = tag.automatic;
      }
    }
    for (const tag of Object.values(uniqueTrackTags)) {
      if ((isHumanTagged && tag.human) || (!isHumanTagged && tag.automatic)) {
        uniqueTags[tag.what] = uniqueTags[tag.what] || tag;
      }
    }
    // Just take the human tags for the track, fall back to automatic.
  }
  return Object.values(uniqueTags);
};

const labelsForRecording = (recording: ApiRecordingResponse): TagItem[] => {
  // Get unique tags for recording, and compile the taggers.
  const uniqueLabels: Record<string, TagItem> = {};
  for (const tag of recording.tags) {
    let isHumanTagged = false;
    uniqueLabels[tag.detail] = uniqueLabels[tag.detail] || {
      human: false,
      automatic: false,
      what: tag.detail,
      displayName: tag.detail,
    };
    const existingTag = uniqueLabels[tag.detail];
    if (!existingTag.human && !tag.automatic) {
      isHumanTagged = true;
      existingTag.human = !tag.automatic;
    }
    if (!existingTag.automatic && tag.automatic) {
      existingTag.automatic = tag.automatic;
    }

    for (const tag of Object.values(uniqueLabels)) {
      if ((isHumanTagged && tag.human) || (!isHumanTagged && tag.automatic)) {
        uniqueLabels[tag.what] = uniqueLabels[tag.what] || tag;
      }
    }
    // Just take the human tags for the track, fall back to automatic.
  }
  return Object.values(uniqueLabels);
};

const loadedRouteName = ref<string>("");
</script>
<template>
  <section-header>Activity</section-header>
  <!--  <h6>Things that need to appear here:</h6>-->
  <!--  <ul>-->
  <!--    <li>Ability to do arbitrary queries over the group</li>-->
  <!--    <li>List recordings for the current group query</li>-->
  <!--    <li>List visits for the current group query</li>-->
  <!--    <li>A list of pre-populated/saved queries (cool, flagged for review)</li>-->
  <!--    <li>Tagging stats (tagged vs not-tagged etc)</li>-->
  <!--  </ul>-->
  <div
    class="d-flex flex-md-row flex-column-reverse flex-fill search-container"
    ref="searchContainer"
  >
    <div class="search-controls-outer">
      <div class="search-controls">
        <div>
          <div
            class="btn-group d-flex mb-2"
            role="group"
            aria-label="Toggle between camera and bird monitor results"
            v-if="projectHasAudioAndThermal"
          >
            <input
              type="radio"
              class="btn-check"
              name="recording-mode"
              id="recording-mode-cameras"
              autocomplete="off"
              v-model="recordingMode"
              value="cameras"
            />
            <label
              class="btn btn-outline-secondary w-50"
              for="recording-mode-cameras"
              >Cameras</label
            >
            <input
              type="radio"
              class="btn-check"
              name="recording-mode"
              id="recording-mode-audio"
              autocomplete="off"
              v-model="recordingMode"
              value="audio"
            />
            <label
              class="btn btn-outline-secondary w-50"
              for="recording-mode-audio"
              >Bird Monitors</label
            >
          </div>
          <div
            class="btn-group d-flex"
            role="group"
            aria-label="Toggle between results groups as visits or as recordings"
          >
            <input
              type="radio"
              class="btn-check"
              name="display-mode"
              id="display-mode-visits"
              autocomplete="off"
              v-model="displayMode"
              :value="'visits'"
            />
            <label
              class="btn btn-outline-secondary w-50"
              for="display-mode-visits"
              >Visits</label
            >
            <input
              type="radio"
              class="btn-check"
              name="display-mode"
              id="display-mode-recordings"
              autocomplete="off"
              v-model="displayMode"
              :value="'recordings'"
            />
            <label
              class="btn btn-outline-secondary w-50"
              for="display-mode-recordings"
              >Recordings</label
            >
          </div>
        </div>
        <div class="mt-2">
          <label class="fs-7">Date range</label>
          <multiselect
            v-model="selectedDateRange"
            :options="commonDateRanges"
            value-prop="value"
            label="label"
            :searchable="false"
            :can-clear="false"
            :can-deselect="false"
            class="ms-bootstrap"
            @change="maybeSelectDatePicker"
          />
          <!--  TODO: Should this be using min/maxDateForSelectedLocations?    -->
          <datepicker
            v-if="selectedDateRange === 'custom'"
            ref="dateRangePicker"
            class="mt-2"
            range
            :timezone="timezoneForProject"
            v-model="customDateRange"
            :min-date="minDateForProject"
            :max-date="maxDateForProject"
            :start-date="maxDateForProjectMinusTwoWeeks"
            :year-range="[
              minDateForProject.getFullYear(),
              maxDateForProject.getFullYear(),
            ]"
            :text-input-options="{ format }"
            :preview-format="format"
            :enable-time-picker="false"
            :format="format"
            prevent-min-max-navigation
            auto-apply
          />
        </div>
        <div class="mt-2">
          <label class="fs-7">Locations</label>
          <multiselect
            mode="tags"
            ref="selectedLocationsSelect"
            v-model="selectedLocations"
            :options="locationsInSelectedTimespanOptions"
            :can-clear="false"
            class="ms-bootstrap"
            @change="onChangeLocationsSelect"
            searchable
          />
        </div>

        <button
          type="button"
          class="btn mt-2 fs-7 px-0 advanced-filtering-btn d-flex align-items-center w-100"
          @click="showAdvanced = !showAdvanced"
        >
          Advanced filtering
          <font-awesome-icon
            icon="chevron-right"
            :rotation="!showAdvanced ? 90 : 270"
            size="sm"
            class="ms-2"
          />
        </button>
        <div class="advanced-search" v-if="showAdvanced">
          <div class="mt-2">
            <label class="fs-7">Tagged by</label>
            <div>
              <b-form-checkbox-group
                v-model="taggedBy"
                :options="taggedByOptions"
              />
            </div>
            <div v-if="taggedBy.length !== 0">
              <label class="fs-7">Tagged as</label>

              <hierarchical-tag-select
                class="flex-grow-1"
                ref="tagSelect"
                :open-on-mount="false"
                v-model="selectedTags"
                multiselect
              />
            </div>
            <div v-if="taggedBy.length !== 0" class="mt-2">
              <b-form-checkbox
                v-model="allPredators"
                :indeterminate="somePredatorsSelected"
                >All predators</b-form-checkbox
              >
              <b-form-checkbox v-model="includeSubSpeciesTags"
                >Include sub-species tags</b-form-checkbox
              >
            </div>
          </div>

          <div class="mt-2">
            <label class="fs-7">Filtering</label>
            <b-form-checkbox v-model="showFilteredRecordings"
              >Include recordings that have no tracks or only false
              positives.</b-form-checkbox
            >
          </div>

          <div class="mt-2">
            <label class="fs-7">Labeled with</label>
            <b-form-checkbox-group>
              <b-form-checkbox v-model="selectedCoolLabel"
                >Cool</b-form-checkbox
              >
              <b-form-checkbox v-model="selectedFlaggedLabel"
                >Flagged</b-form-checkbox
              >
              <b-form-checkbox
                v-model="selectedOtherLabels"
                @change="maybeUnselectedOtherLabels"
                >Other</b-form-checkbox
              >
            </b-form-checkbox-group>
            <multiselect
              v-if="selectedOtherLabels"
              v-model="selectedLabels"
              :options="availableLabels"
              mode="tags"
              :can-clear="false"
              class="ms-bootstrap"
              searchable
            />
          </div>
        </div>
        <button
          type="button"
          class="btn btn-primary w-100 mt-2"
          :disabled="!searchIsValid"
          @click="doSearch"
        >
          Search
        </button>
        <button
          type="button"
          class="btn btn-outline-secondary w-100 mt-2"
          :disabled="!searchIsValid"
          @click="doExport"
        >
          Export search results
        </button>
      </div>
    </div>
    <div class="search-results flex-grow-1 d-flex justify-content-center pb-3">
      <div class="search-results-inner">
        <div class="search-description">
          Blurb describing the search parameters.
        </div>

        <div v-if="currentQueryCount === undefined">
          Loading totals...
          <b-spinner />
        </div>
        <div v-else-if="currentQueryCount || currentQueryCount === 0">
          Loaded {{ currentQueryLoaded }} / Total {{ currentQueryCount }}
        </div>
        <!--        <div-->
        <!--          class="box mb-3 list-item"-->
        <!--          v-for="recording in loadedRecordings"-->
        <!--          :key="recording.recordingDateTime"-->
        <!--        >-->
        <!--          {{ recording.id }}, {{ recording.stationName }}-->
        <!--        </div>-->
        <div class="search-items-container">
          <div
            class="mb-3 day-container"
            v-for="day in chunkedRecordings"
            :key="day.dateTime.day"
          >
            <div class="day-header">
              {{ day.dateTime.toLocaleString(DateTime.DATE_FULL) }}
            </div>

            <div
              v-for="(item, index) in day.items"
              :key="index"
              class="list-item d-flex user-select-none fs-8"
              :class="[
                item.type,
                {
                  selected:
                    item.type === 'recording' &&
                    item.data.id === currentlySelectedRecording,
                },
              ]"
              @click="selectedRecording(item)"
              @mouseenter="() => highlightedLocation(item)"
              @mouseleave="() => unhighlightedLocation(item)"
            >
              <div
                class="visit-time-duration d-flex flex-column py-2 pe-3 flex-shrink-0"
              >
                <span class="pb-1" v-if="item.type === 'recording'">{{
                  timeAtLocation(
                    item.data.recordingDateTime,
                    canonicalLatLngForActiveLocations
                  )
                }}</span>
                <span class="pb-1" v-else>{{
                  timeAtLocation(item.data, canonicalLatLngForActiveLocations)
                }}</span>
                <span
                  class="duration fs-8"
                  v-if="item.type === 'recording'"
                  v-html="formatDuration(item.data.duration * 1000)"
                ></span>
              </div>
              <div class="visit-timeline">
                <svg
                  viewBox="0 0 32 36"
                  class="sun-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  v-if="item.type === 'sunrise'"
                >
                  <rect x="-2" y="-2" width="36" height="40" fill="#f6f6f6" />
                  <g
                    transform="matrix(0.151304,0,0,0.151304,-22.1954,-34.6843)"
                  >
                    <path
                      fill="currentColor"
                      d="M161.213,434.531L161.213,418.781L194.046,418.781L194.541,415.968C195.47,410.687 197.983,404.084 201.238,398.372L204.49,392.666L181.46,369.671L192.71,358.421L215.841,381.516L219.464,379.197C224.28,376.115 229.455,373.935 235.838,372.298L241.088,370.952L241.492,337.781L257.934,337.781L258.338,370.952L263.588,372.298C269.971,373.935 275.146,376.115 279.962,379.197L283.585,381.516L306.703,358.434L317.973,369.629L294.734,392.906L296.282,395.156C299.306,399.551 302.884,407.739 304.177,413.221L305.487,418.781L338.213,418.781L338.213,434.531L161.213,434.531ZM288.226,414.843C286.39,408.589 283.456,403.805 278.213,398.518C262.19,382.361 237.323,382.358 221.203,398.51C215.98,403.743 213.057,408.516 211.2,414.842L210.044,418.78L289.382,418.78L288.226,414.843Z"
                    />
                    <path
                      fill="currentColor"
                      d="M241.463,322.031L241.463,289.781C241.463,289.781 218.213,289.525 218.213,289.212C218.213,288.899 249.713,257.169 249.713,257.169C249.713,257.169 281.213,288.899 281.213,289.212C281.213,289.525 257.963,289.781 257.963,289.781L257.963,322.031L241.463,322.031Z"
                      style="fill-rule: nonzero"
                    />
                  </g>
                </svg>
                <svg
                  viewBox="0 0 32 36"
                  class="sun-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  v-else-if="item.type === 'sunset'"
                >
                  <rect x="-2" y="-2" width="36" height="40" fill="#f6f6f6" />
                  <g
                    transform="matrix(0.151304,0,0,0.151304,-22.1954,-34.6843)"
                  >
                    <path
                      fill="currentColor"
                      d="M161.213,434.531L161.213,418.781L194.046,418.781L194.541,415.968C195.47,410.687 197.983,404.084 201.238,398.372L204.49,392.666L181.46,369.671L192.71,358.421L215.841,381.516L219.464,379.197C224.28,376.115 229.455,373.935 235.838,372.298L241.088,370.952L241.492,337.781L257.934,337.781L258.338,370.952L263.588,372.298C269.971,373.935 275.146,376.115 279.962,379.197L283.585,381.516L306.703,358.434L317.973,369.629L294.734,392.906L296.282,395.156C299.306,399.551 302.884,407.739 304.177,413.221L305.487,418.781L338.213,418.781L338.213,434.531L161.213,434.531ZM288.226,414.843C286.39,408.589 283.456,403.805 278.213,398.518C262.19,382.361 237.323,382.358 221.203,398.51C215.98,403.743 213.057,408.516 211.2,414.842L210.044,418.78L289.382,418.78L288.226,414.843Z"
                    />
                    <path
                      fill="currentColor"
                      class="sun-arrow"
                      d="M241.463,322.031L241.463,289.781C241.463,289.781 218.213,289.525 218.213,289.212C218.213,288.899 249.713,257.169 249.713,257.169C249.713,257.169 281.213,288.899 281.213,289.212C281.213,289.525 257.963,289.781 257.963,289.781L257.963,322.031L241.463,322.031Z"
                      style="fill-rule: nonzero"
                    />
                  </g>
                </svg>
                <div v-else class="circle"></div>
              </div>
              <div
                v-if="item.type !== 'recording'"
                class="py-2 ps-3 text-capitalize"
              >
                {{ item.type }}
              </div>
              <div
                v-else
                class="d-flex py-2 ps-3 align-items-center flex-fill overflow-hidden recording-detail my-1 me-1"
              >
                <div class="visit-thumb">
                  <image-loader
                    :src="thumbnailSrcForRecording(item.data)"
                    alt="Thumbnail for first recording of this visit"
                    width="45"
                    height="45"
                  />
                </div>
                <div class="ps-3 d-flex flex-column text-truncate flex-wrap">
                  <div class="tags-container d-flex flex-wrap">
                    <span
                      class="visit-species-tag px-1 mb-1 text-capitalize me-1"
                      :class="tag.path.split('.')"
                      :key="tag.what"
                      v-for="(tag, index) in tagsForRecording(item.data)"
                      >{{ displayLabelForClassificationLabel(tag.what) }}
                      <font-awesome-icon
                        icon="check"
                        size="xs"
                        v-if="tag.human && tag.automatic"
                        class="mx-1 align-middle"
                        style="padding-bottom: 2px"
                      />
                      <font-awesome-icon
                        icon="user"
                        size="xs"
                        v-else-if="tag.human"
                        class="mx-1 align-middle"
                        style="padding-bottom: 2px"
                      />
                      <font-awesome-icon
                        icon="cog"
                        size="xs"
                        v-else-if="tag.automatic"
                        class="mx-1 align-middle"
                        style="padding-bottom: 2px"
                      />
                    </span>
                    <span
                      class="visit-species-tag px-1 mb-1 text-capitalize me-1"
                      :class="[label.what]"
                      :key="label.what"
                      v-for="(label, index) in labelsForRecording(item.data)"
                      >{{ label.what }}
                    </span>
                  </div>
                  <span
                    class="visit-station-name text-truncate flex-shrink-1 pe-2"
                    ><font-awesome-icon
                      icon="map-marker-alt"
                      size="xs"
                      class="station-icon pe-1 text"
                    />{{ item.data.stationName }}</span
                  >
                  <span
                    class="visit-station-name text-truncate flex-shrink-1 pe-2"
                    ><font-awesome-icon
                      icon="video"
                      size="xs"
                      class="station-icon pe-1 text"
                    />{{ item.data.deviceName }}</span
                  >
                  <span
                    class="visit-station-name text-truncate flex-shrink-1 pe-2"
                    ><font-awesome-icon
                      icon="stream"
                      size="xs"
                      class="station-icon pe-1 text"
                    /><span v-if="item.data.tracks.length === 0">No tracks</span
                    ><span v-else-if="item.data.tracks.length === 1"
                      >1 track</span
                    ><span v-else
                      >{{ item.data.tracks.length }} tracks</span
                    ></span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="searching"
          class="d-flex justify-content-center flex-columns"
        >
          <b-spinner />
        </div>
        <div
          v-else-if="completedCurrentQuery && canExpandSearchBackFurther"
          class="d-flex justify-content-center flex-column"
        >
          <span class="text-center mb-2"
            >No more results for the selected time range.</span
          >
          <button
            @click="adjustTimespanBackwards"
            type="button"
            class="btn btn-secondary"
          >
            Expand the search range back to
            {{ relativeTimeIncrementInPast }}
          </button>
        </div>
        <div v-else-if="loadedRecordings.length">
          No results before this time.
        </div>
      </div>
    </div>
    <div class="map-buffer" ref="mapBuffer"></div>
  </div>
  <map-with-points
    :points="locationsForMap"
    :active-points="locationsInSelectedTimespanForMap"
    :highlighted-point="highlightedPoint"
    @hover-point="highlightPoint"
    @leave-point="highlightPoint"
    :radius="30"
  />
  <inline-view-modal
    :fade-in="loadedRouteName === 'activity'"
    :parent-route-name="'activity'"
    @shown="() => (loadedRouteName = 'activity')"
  />
</template>
<style lang="less" scoped>
.search-results-inner {
  max-width: 700px;
  min-width: 550px;
}
.search-controls {
  width: 250px;
  position: sticky;
  top: 15px;
}
.box {
  background: #ccc;
  min-height: 100px;
}
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

.advanced-filtering-btn,
.advanced-filtering-btn:hover {
  color: #007086;
}
.advanced-filtering-btn:focus {
  box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
  border-radius: 0.375rem;
}

.ms-bootstrap {
  // Match focus colours to bootstrap?
  --ms-ring-width: 0.25rem;
  --ms-ring-color: rgb(13 110 253 / 25%);
  --ms-border-color-active: #86b7fe;
}
.dp__theme_light {
  --dp-border-color-hover: #86b7fe;
  --dp-border-radius: 0.375rem;
  //&:focus {
  //  box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
  //}
  border-radius: 0.375rem;
}
//.dp__input {
//  border-radius: 0.375rem;
//}
.dp__input_focus {
  //border-radius: 0.375rem;
  box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
}
</style>
<style lang="less">
.multiselect-tag {
  white-space: unset !important;
}
</style>
<style src="@vueform/multiselect/themes/default.css"></style>
<style src="@vuepic/vue-datepicker/dist/main.css"></style>

<style scoped lang="less">
.visits-daily-breakdown {
  background: white;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);

  .header {
    border-bottom: 1px solid #eee;
    font-weight: 500;
  }
  .visit-species-count {
    border-radius: 2px;
    color: #444444;
    display: inline-block;
    height: 24px;
    line-height: 24px;
    margin-bottom: 10px;
    &:not(:last-child) {
      margin-right: 21px;
    }
    .species {
      padding: 0 5px;
    }
    .count {
      background: #7d7d7d;
      border-top-left-radius: 2px;
      border-bottom-left-radius: 2px;
      color: white;
      text-align: center;
      padding: 0 2px;
      min-width: 21px;
      font-weight: 500;
      display: inline-block;
    }
    background: rgba(125, 125, 125, 0.1);
    &.mustelid {
      background: rgba(173, 0, 0, 0.1);
      .count {
        background: #ad0000;
      }
    }
    &.possum,
    &.cat {
      background: rgba(163, 0, 20, 0.1);
      .count {
        background: #a30014;
      }
    }
    &.rodent,
    &.hedgehog {
      background: rgba(163, 96, 0, 0.1);
      .count {
        background: #a36000;
      }
    }
  }
}
.sunrise,
.sunset {
  color: #aaa;
}
.night-icon {
  color: rgba(0, 0, 0, 0.2);
}
.list-item {
  line-height: 14px;
  transition: background-color linear 0.2s;
  border-radius: 3px;
  > * {
    pointer-events: none;
  }
  &:hover:not(&[class*="sun"]) {
    background: #eee;
  }
  &.selected {
    background: #aaa;
  }
  .visit-time-duration {
    width: 70px;
    color: #666;
    text-align: right;
  }
  &.sunrise,
  &.sunset {
    .visit-time-duration {
      color: #aaa;
    }
  }
  .visit-thumb {
    min-width: 45px;
    max-width: 45px;
    width: 45px;
    height: 45px;
    overflow: hidden;
    position: relative;
    background: #aaa;
    .num-recordings {
      background: rgba(0, 0, 0, 0.8);
      color: white;
      position: absolute;
      bottom: 0;
      left: 0;
    }
  }
  .visit-timeline {
    border-left: 1px solid #ddd;
    .circle {
      margin-top: 12px;
      width: 6px;
      height: 6px;
      border-radius: 3px;
      background: white;
      transform: translateX(-3.5px);
      border: 1px solid #ddd;
    }
    .sun-icon {
      margin-top: 12px;
      width: 6px;
      height: 6px;
      color: #ccc;
      background: white;
      transform: translateX(-3.5px) scale(3.5);
      .sun-arrow {
        transform-box: fill-box;
        transform-origin: center;
        transform: rotate(180deg);
      }
    }
  }
  &:first-child,
  &:last-child {
    .visit-timeline {
      position: relative;
      &::before {
        position: absolute;
        display: block;
        content: " ";
        height: 50%;
        width: 1px;
        left: -1px;
        border-left: 1px dashed white;
      }
    }
  }
  &:last-child {
    .visit-timeline {
      &::before {
        top: 15px;
        height: unset;
        bottom: 0;
      }
    }
  }
  .visit-species-tag {
    background: #999;
    color: white;
    display: inline-block;
    border-radius: 3px;
    line-height: 20px;
    font-weight: 500;
    &.mustelid {
      background: #ad0000;
    }
    &.possum,
    &.cat {
      background: #a30014;
    }
    &.rodent,
    &.hedgehog {
      background: #a36000;
    }
  }
  .station-icon {
    color: rgba(0, 0, 0, 0.5);
  }

  .recording-detail {
    max-width: 469px;
    background: white;
    border-radius: 3px;
  }
}
img.image-loading {
  background: red;
}
</style>

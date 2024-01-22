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
import type { PublicMethods as DatePickerMethods } from "@vuepic/vue-datepicker";
import Datepicker from "@vuepic/vue-datepicker";
import { getLocationsForProject } from "@api/Project";
import {
  activeLocations,
  currentSelectedProject as currentActiveProject,
  latLngForActiveLocations,
  userProjects,
} from "@models/provides";
import type { SelectedProject } from "@models/LoggedInUser";
import type { LoadedResource, SuccessFetchResult } from "@api/types";
import { RecordingLabels } from "@/consts";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { queryRecordingsInProject } from "@api/Recording";
import type { RecordingType } from "@typedefs/api/consts.ts";
import {
  RecordingType as ConcreteRecordingType,
  TagMode,
} from "@typedefs/api/consts.ts";

import type { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import type {
  RecordingId,
  StationId as LocationId,
} from "@typedefs/api/common";
import InlineViewModal from "@/components/InlineViewModal.vue";
import type { MaybeElement } from "@vueuse/core";
import {
  useElementBounding,
  useIntersectionObserver,
  useWindowSize,
} from "@vueuse/core";
import { DateTime } from "luxon";
import { timezoneForLatLng } from "@models/visitsUtils";
import { canonicalLatLngForLocations } from "@/helpers/Location";
import * as sunCalc from "suncalc";
import { getClassifications } from "@api/Classifications";
import { useRoute, useRouter } from "vue-router";
import RecordingsList from "@/components/RecordingsList.vue";
import VisitsBreakdownList from "@/components/VisitsBreakdownList.vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import { getAllVisitsForProjectBetweenTimes } from "@api/Monitoring";
import { updateUserOnboarding, getUserOnboarding } from "@/api/User";
import Shepherd from "shepherd.js";
import { offset } from "@floating-ui/dom";
import "shepherd.js/dist/css/shepherd.css";

const mapBuffer = ref<HTMLDivElement>();
const searchContainer = ref<HTMLDivElement>();
const shownUserActivityOnboarding = ref<boolean>(false);

const { right: searchContainerRight, top: searchContainerTop } =
  useElementBounding(searchContainer);
const { height: windowHeight } = useWindowSize();
const setMapBufferWidth = (parentElRight: number) => {
  if (mapBuffer.value) {
    const right = window.innerWidth - parentElRight;
    (mapBuffer.value as HTMLDivElement).style.width = `${Math.max(
      0,
      500 - right
    )}px`;
  }
};
const setSearchContainerHeight = (winHeight: number) => {
  if (searchContainer.value) {
    //searchContainer.value.style.height = `${windowHeight.value - searchContainerTop.value}px`;
  }
};

const getUserActivityOnboardingStatus = async () => {
  try {
    const result = await getUserOnboarding();
    const onboardTrackingData = result || {};
    return onboardTrackingData.result.onboardTracking.activity;
  } catch (error) {
    console.error("Error getting user onboarding data", error);
    return false;
  }
};

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

const tour = new Shepherd.Tour({
  useModalOverlay: true,
  defaultStepOptions: {
    classes: "shepherd-theme-arrows",
    scrollTo: true,
  },
});

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
    const project = (availableProjects.value as ApiProjectResponse[]).find(
      ({ id }) => id === (currentProject.value as SelectedProject).id
    );
    return project || null;
  }
  return null;
});

const projectHasAudio = computed<boolean>(() => {
  return (
    !!currentSelectedProject.value &&
    "lastAudioRecordingTime" in currentSelectedProject.value
  );
});

const projectHasCameras = computed<boolean>(() => {
  return (
    !!currentSelectedProject.value &&
    "lastThermalRecordingTime" in currentSelectedProject.value
  );
});

const projectHasAudioAndThermal = computed<boolean>(() => {
  return projectHasAudio.value && projectHasCameras.value;
});

const locations = ref<LoadedResource<ApiLocationResponse[]>>(null);
const availableLabels = computed(() => {
  const labels = RecordingLabels.slice(2).map(({ text, value }) => ({
    label: text,
    value: (value || text).toLowerCase(),
  }));
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
    if (customDateRange.value !== null) {
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
    return [new Date(), new Date()];
  } else {
    return selectedDateRange.value as [Date, Date];
  }
});

let customAutomaticallySet = false;
const maybeSelectDatePicker = (value: [Date, Date] | string) => {
  if (value === "custom" && !customAutomaticallySet) {
    nextTick(() => {
      if (dateRangePicker.value) {
        (dateRangePicker.value as DatePickerMethods).openMenu();
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
    return (locations.value as ApiLocationResponse[])
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

watch(recordingMode, () => {
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
    return (locations.value as ApiLocationResponse[]).filter((location) => {
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
  _select: MultiSelectEl
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

interface LocationOption {
  value: "any" | ApiLocationResponse;
  label: string;
  disabled?: boolean;
}
interface MultiSelectEl extends Multiselect {
  clear: () => void;
  select: (option: LocationOption) => void;
}

const selectedLocationsSelect = ref<MultiSelectEl>();
const optionsInited = ref<boolean>(false);
const optionsRemapping = ref<boolean>(false);

const remapLocationOptions = (nextOptions: LocationOption[]) => {
  // If this changed, we need to remap the selected locations to the existing
  // locations.
  const selected = [...selectedLocations.value];
  nextTick(() => {
    if (optionsInited.value) {
      optionsRemapping.value = true;
      if (selectedLocationsSelect.value) {
        const multiselectEl = selectedLocationsSelect.value as MultiSelectEl;
        multiselectEl.clear();
        for (const item of selected) {
          if (item === "any") {
            multiselectEl.select(nextOptions[0]);
          } else {
            const match = nextOptions.find(
              (option) =>
                (option.value as ApiLocationResponse).id &&
                (option.value as ApiLocationResponse).id === item.id
            );
            if (match) {
              multiselectEl.select(match);
            }
          }
        }
        if (selectedLocations.value.length === 0) {
          multiselectEl.select(nextOptions[0]);
        }
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
    return new Date(minDateForProject.value);
  }
  let earliest = new Date();
  if (selectedLocations.value) {
    for (const location of selectedLocations.value) {
      const activeAt = new Date((location as ApiLocationResponse).activeAt);
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
const highlightPoint = (_point: NamedPoint) => {
  // TODO: Could highlight all visible list items that correspond to the highlighted map location?
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

const displayMode = ref<"visits" | "recordings">("visits");

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
    return currentQueryCount.value as number;
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

const currentlySelectedVisit = ref<ApiVisitResponse | null>(null);
const chunkedVisits = ref<ApiVisitResponse[]>([]);
//const visitsContext = ref<ApiVisitResponse[] | null>(null);
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
      (currentProject.value as SelectedProject).id.toString(),
      true
    );
    selectedDateRange.value = commonDateRanges.value[0].value;

    await doSearch();
  }
  loading.value = false;
  shownUserActivityOnboarding.value = await getUserActivityOnboardingStatus();
  initActivityTour();
});

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
watch(chunkedVisits.value, () => {
  needsObserverUpdate = true;
});

let currentObserver: { stop: () => void } | null;

onUpdated(() => {
  if (needsObserverUpdate) {
    let nearLast;
    if (displayMode.value === "recordings") {
      nearLast = document.querySelector(
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
    } else if (displayMode.value === "visits") {
      nearLast = document.querySelector(
        ".visits-daily-breakdown:nth-last-child(3)"
      );
      if (!nearLast) {
        nearLast = document.querySelector(
          ".visits-daily-breakdown:nth-last-child(2)"
        );
      }
      if (!nearLast) {
        nearLast = document.querySelector(".visits-daily-breakdown:last-child");
      }
    }
    if (nearLast) {
      console.log("Check if we need to load more");
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

const getCurrentQueryHash = (): string => {
  // Keep track of the recordingState/cursor using a hash of the query,
  const fromDateTime = combinedDateRange.value[0];
  const untilDateTime = combinedDateRange.value[1];
  return JSON.stringify({
    ...getCurrentQuery(),
    displayMode: displayMode.value,
    fromDateTime,
    untilDateTime,
  });
};

interface RecordingQueryBase {
  types: (
    | RecordingType.ThermalRaw
    | RecordingType.Audio
    | RecordingType.TrailCamVideo
    | RecordingType.TrailCamImage
  )[];
  locations?: LocationId[];
}
const getCurrentQuery = (): RecordingQueryBase => {
  const query: RecordingQueryBase = {
    types:
      recordingMode.value === "cameras"
        ? [
            ConcreteRecordingType.ThermalRaw,
            ConcreteRecordingType.TrailCamVideo,
            ConcreteRecordingType.TrailCamImage,
          ]
        : [ConcreteRecordingType.Audio],
  };
  const isAnyLocation = selectedLocations.value[0] === "any";
  if (!isAnyLocation) {
    query.locations = selectedLocations.value.map(
      (loc) => (loc as ApiLocationResponse).id
    );
  }
  return query;
};

const appendRecordingsChunkedByDay = (recordings: ApiRecordingResponse[]) => {
  for (const recording of recordings) {
    // Get the location local day:
    const recordingDate = new Date(recording.recordingDateTime);
    const dateTime = DateTime.fromJSDate(recordingDate, {
      zone: timezoneForLatLng(canonicalLatLngForActiveLocations.value),
    });

    const { sunrise, sunset } = sunCalc.getTimes(
      recordingDate,
      canonicalLatLngForActiveLocations.value.lat,
      canonicalLatLngForActiveLocations.value.lng
    );

    let prevDay;
    if (chunkedRecordings.value.length !== 0) {
      prevDay = chunkedRecordings.value[chunkedRecordings.value.length - 1];
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
    prevDay = chunkedRecordings.value[chunkedRecordings.value.length - 1];
    let prevItem;
    if (prevDay.items.length) {
      prevItem = prevDay.items[prevDay.items.length - 1];
    }
    if (prevItem && prevItem.type === "recording") {
      const prevRecordingDate = new Date(prevItem.data.recordingDateTime);
      // See if we can insert sunset/rise
      if (
        sunset.getDate() === recordingDate.getDate() &&
        sunset < prevRecordingDate &&
        sunset > recordingDate
      ) {
        prevDay.items.push({
          type: "sunset",
          data: sunset.toISOString(),
        });
      }
      if (
        sunrise.getDate() === recordingDate.getDate() &&
        sunrise < prevRecordingDate &&
        sunrise > recordingDate
      ) {
        prevDay.items.push({
          type: "sunrise",
          data: sunrise.toISOString(),
        });
      }
    }
    prevDay.items.push({
      type: "recording",
      data: recording,
    });
  }
};

const appendVisitsChunkedByDay = (visits: ApiVisitResponse[]) => {
  for (const visit of visits) {
    // TODO: May need to optimise this as the list gets long?
    chunkedVisits.value.push(visit);
  }
};

const resetQuery = (
  newQueryHash: string,
  fromDateTime: Date,
  untilDateTime: Date
) => {
  while (loadedRecordings.value.length) {
    loadedRecordings.value.pop();
  }
  while (loadedRecordingIds.value.length) {
    loadedRecordingIds.value.pop();
  }
  while (chunkedRecordings.value.length) {
    chunkedRecordings.value.pop();
  }
  while (chunkedVisits.value.length) {
    chunkedVisits.value.pop();
  }
  currentQueryHash.value = newQueryHash;
  currentQueryLoaded.value = 0;
  completedCurrentQuery.value = false;
  // NOTE: If it's the first load for a given query, lazily get the count as a separate query.
  // TODO Also, make it abortable if we change queries.
  currentQueryCount.value = undefined;
  currentQueryCursor.value = {
    fromDateTime,
    untilDateTime,
  };
};

const initActivityTour = () => {
  if (!shownUserActivityOnboarding.value) {
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
    updateUserOnboarding({ settings: { onboardTracking: { activity: true } } })
      .then((response) => {
        console.log("Locations onboarding data updated successfully", response);
      })
      .catch((error) => {
        console.error("Error updating locations onboarding data", error);
      });
  }
};

// NOTE: We try to load at most one month at a time.
const getRecordingsOrVisitsForCurrentQuery = async () => {
  if (currentProject.value) {
    const fromDateTime = combinedDateRange.value[0];
    const untilDateTime = combinedDateRange.value[1];
    const query = getCurrentQuery();
    const queryHash = getCurrentQueryHash();
    const isNewQuery = queryHash !== currentQueryHash.value;
    const project = currentProject.value as SelectedProject;
    if (isNewQuery) {
      resetQuery(queryHash, fromDateTime, untilDateTime);
      if (displayMode.value === "recordings") {
        // Load total recording count for query lazily, so we
        // don't block the main rendering query.
        queryRecordingsInProject(project.id, {
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
      } else {
        currentQueryCount.value = null;
      }
    }
    const hasNotLoadedAllOfQueryTimeRange =
      currentQueryCursor.value.fromDateTime <
      currentQueryCursor.value.untilDateTime;
    if (hasNotLoadedAllOfQueryTimeRange) {
      // console.log("Count all", queryMap[key].loaded === 0);
      // First time through, we want to count all for a given timespan query.
      const itemHeight = displayMode.value === "recordings" ? 80 : 160;
      const twoPagesWorth = Math.ceil(windowHeight.value / itemHeight) * 2;
      let response;
      if (displayMode.value === "recordings") {
        response = await queryRecordingsInProject(project.id, {
          ...query,
          limit: twoPagesWorth,
          fromDateTime: currentQueryCursor.value.fromDateTime,
          untilDateTime: currentQueryCursor.value.untilDateTime,
        });
      } else if (displayMode.value === "visits") {
        console.log(
          "Requesting",
          DateTime.fromJSDate(
            currentQueryCursor.value.fromDateTime as Date
          ).toLocaleString(),
          DateTime.fromJSDate(
            currentQueryCursor.value.untilDateTime as Date
          ).toLocaleString()
        );
        console.log(`Load ${twoPagesWorth} days of visits`, query.types);
        response = await getAllVisitsForProjectBetweenTimes(
          project.id,
          currentQueryCursor.value.fromDateTime,
          currentQueryCursor.value.untilDateTime,
          query.locations,
          query.types
        );
      }
      if (response && response.success) {
        let loadedFewerItemsThanRequested;
        let gotUntilDate: Date | undefined;
        if (displayMode.value === "recordings") {
          const recordingsResponse = response as SuccessFetchResult<{
            rows: ApiRecordingResponse[];
            limit: number;
            count: number;
          }>;
          loadedFewerItemsThanRequested =
            recordingsResponse.result.count < recordingsResponse.result.limit;
          const recordings = recordingsResponse.result.rows;
          loadedRecordings.value.push(...recordings);
          loadedRecordingIds.value.push(...recordings.map(({ id }) => id));
          appendRecordingsChunkedByDay(recordings);
          currentQueryLoaded.value += recordings.length;
          if (recordings.length !== 0) {
            gotUntilDate = new Date(
              recordings[recordings.length - 1].recordingDateTime
            );
            console.log("Got until date", gotUntilDate);
          }
        } else if (displayMode.value === "visits") {
          const visits = response.visits as ApiVisitResponse[];
          loadedFewerItemsThanRequested = !response.all;

          if (visits.length !== 0) {
            // Set current time to 8.02am Fri 31st March for incomplete visits
            let lastVisit = visits[visits.length - 1];
            gotUntilDate = new Date(lastVisit.timeStart);
            if (lastVisit.incomplete) {
              // Remove last incomplete visit, start again at end of the previous complete one.
              visits.pop();
              if (visits.length) {
                lastVisit = visits[visits.length - 1];
                gotUntilDate = new Date(lastVisit.timeStart);
              }
            }
          }
          // NOTE: Append new visits.
          // Keep loading visits in the time-range selected until we fill up the page.
          appendVisitsChunkedByDay(visits);
        }
        if (gotUntilDate) {
          // Increment the cursor.
          // NOTE: Not sure if this offsetting is necessary?
          gotUntilDate.setMilliseconds(gotUntilDate.getMilliseconds() - 1);
          currentQueryCursor.value.untilDateTime = gotUntilDate;

          if (loadedFewerItemsThanRequested) {
            const reachedMinDateForSelectedLocations =
              currentQueryCursor.value.fromDateTime.getTime() ===
              minDateForSelectedLocations.value.getTime();
            if (reachedMinDateForSelectedLocations) {
              console.log("!!! stopping any observers");
              currentObserver && currentObserver.stop();
              currentObserver = null;
              // We're at the limit
            } else {
              // We're at the end of the current time range, but can expand it back further
              // and load more.
              currentQueryCursor.value.fromDateTime = new Date(
                currentQueryCursor.value.untilDateTime as Date
              );
            }
            completedCurrentQuery.value = true;
          }
        } else {
          console.log("Completed current query range");
          currentQueryCursor.value.fromDateTime = new Date(
            currentQueryCursor.value.untilDateTime as Date
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
  await getRecordingsOrVisitsForCurrentQuery();
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
  //const currentInc =

  const fromDateTime = new Date(combinedDateRange.value[0]);
  const setBackFourWeeks = fromDateTime.setDate(fromDateTime.getDate() - 28);
  const from = Math.max(
    minDateForSelectedLocations.value.getTime(),
    new Date(setBackFourWeeks).getTime()
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
  return DateTime.fromJSDate(fromDateMinusIncrement.value).toRelative({
    round: true,
    padding: 1000 * 60 * 60 * 24 * 14,
  }) as string;
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

const adjustTimespanBackwards = async () => {
  // FIXME - when we adjust the timespan backwards, we need to make sure we keep the existing
  //  locations selection.
  if (selectedDateRange.value === "custom") {
    if (customDateRange.value) {
      customDateRange.value[0] = fromDateMinusIncrement.value;
    } else {
      // Error
    }
  } else {
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
      // NOTE: We need to wait a tick for computed items to resolve.
      await nextTick();
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
  await doSearch();
};
const router = useRouter();

const selectedRecording = async (recordingId: RecordingId) => {
  console.log("Selected recording", recordingId);
  await router.push({
    name: "activity-recording",
    params: {
      currentRecordingId: recordingId,
    },
  });
};

const selectedVisit = (visit: ApiVisitResponse) => {
  currentlySelectedVisit.value = visit;
};

watch(
  currentlySelectedVisit,
  (visit: ApiVisitResponse | null, prevVisit: ApiVisitResponse | null) => {
    if (visit && route.name === "activity") {
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
        name: "activity-visit",
        params,
      });
    }
  }
);

const currentlyHighlightedLocation = ref<LocationId | null>(null);

const loadedRouteName = ref<string>("");

const closedModal = () => {
  currentlySelectedVisit.value = null;
};

provide(activeLocations, locationsInSelectedTimespan);
provide(latLngForActiveLocations, canonicalLatLngForActiveLocations);
provide("loadedRecordingIds", loadedRecordingIds);
provide("currentRecordingCount", currentTotalRecordings);
provide("canLoadMoreRecordingsInPast", canLoadMoreRecordingsInPast);
provide("updatedRecording", updatedRecording);
provide("requestLoadMoreRecordingsInPast", () => loadMoreRecordingsInPast());
provide("currentlySelectedVisit", currentlySelectedVisit);
provide("visitsContext", chunkedVisits);

// TODO: Nice to have - allow expanding the current search range when we reach the end of the list of recordings.
provide("canExpandCurrentQueryInPast", canExpandSearchBackFurther);

const projectHasLocationsWithRecordings = computed<boolean>(() => {
  return locationsForMap.value.length !== 0;
});
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
    v-if="loading"
    class="d-flex justify-content-center align-items-center centered-overlay"
  >
    <b-spinner />
  </div>
  <div v-else-if="!projectHasLocationsWithRecordings">
    This project has no activity yet.
  </div>
  <div
    v-else
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
          &lt;&lt; Blurb describing the search parameters. &gt;&gt;
        </div>

        <div v-if="currentQueryCount === undefined">
          Loading totals...
          <b-spinner />
        </div>
        <div v-else-if="currentQueryCount || currentQueryCount === 0">
          Loaded {{ currentQueryLoaded }} / Total {{ currentQueryCount }}
        </div>
        <div class="search-items-container">
          <recordings-list
            v-if="displayMode === 'recordings'"
            :recordings-by-day="chunkedRecordings"
            @change-highlighted-location="
              (loc) => (currentlyHighlightedLocation = loc)
            "
            @selected-recording="selectedRecording"
            :currently-selected-recording-id="currentlySelectedRecording"
            :canonical-location="canonicalLatLngForActiveLocations"
          />
          <visits-breakdown-list
            v-else-if="displayMode === 'visits'"
            :visits="chunkedVisits"
            :location="canonicalLatLngForActiveLocations"
            :highlighted-location="currentlyHighlightedLocation"
            @selected-visit="selectedVisit"
            @change-highlighted-location="
              (loc) => (currentlyHighlightedLocation = loc)
            "
          />
        </div>
        <div
          v-if="searching"
          class="d-flex justify-content-center flex-columns"
        >
          <b-spinner />
        </div>
        <div
          v-else-if="completedCurrentQuery && canExpandSearchBackFurther"
          class="d-flex justify-content-center flex-column ms-3"
          style="max-width: 524px"
        >
          <span class="text-center mb-2"
            >No more results for the selected time range.</span
          >
          <button
            @click="adjustTimespanBackwards"
            type="button"
            class="btn btn-outline-secondary"
          >
            Expand the search start back to
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
    v-if="projectHasLocationsWithRecordings"
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
    @close="closedModal"
  />
</template>
<style lang="less" scoped>
.centered-overlay {
  height: calc(100vh - 90px);
}
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

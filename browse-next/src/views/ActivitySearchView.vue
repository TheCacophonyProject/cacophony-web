<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import {
  computed,
  type ComputedRef,
  inject,
  nextTick,
  onBeforeMount,
  onBeforeUnmount,
  onUpdated,
  provide,
  ref,
  watch,
  type WatchStopHandle,
} from "vue";
import type { NamedPoint } from "@models/mapUtils";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import {
  activeLocations,
  currentSelectedProject as currentActiveProject,
  latLngForActiveLocations,
  urlNormalisedCurrentSelectedProjectName,
} from "@models/provides";
import { type SelectedProject } from "@models/LoggedInUser";
import type {
  FetchResult,
  LoadedResource,
  SuccessFetchResult,
} from "@api/types";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import {
  type BulkRecordingsResponse,
  getAllRecordingsForProjectBetweenTimes,
  queryRecordingsInProjectNew,
  type QueryRecordingsOptions,
} from "@api/Recording";
import {
  type RecordingType,
  RecordingType as ConcreteRecordingType,
  TagMode,
} from "@typedefs/api/consts.ts";
import type {
  DeviceId,
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
import {
  dayAndTimeAtLocation,
  formatDuration,
  timeAtLocation,
  timezoneForLatLng,
  visitDuration,
} from "@models/visitsUtils";
import { canonicalLatLngForLocations } from "@/helpers/Location";
import * as sunCalc from "suncalc";
import {
  type LocationQuery,
  type LocationQueryValue,
  useRoute,
  useRouter,
} from "vue-router";
import RecordingsList from "@/components/RecordingsList.vue";
import VisitsBreakdownList from "@/components/VisitsBreakdownList.vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import {
  type BulkVisitsResponse,
  getAllVisitsForProjectBetweenTimes,
  getVisitsForProject,
  getVisitsForProjectNew,
  type VisitsQueryResult,
} from "@api/Monitoring";
import ActivitySearchParameters from "@/components/ActivitySearchParameters.vue";
import { getLocationsForProject } from "@api/Project.ts";
import {
  ActivitySearchDisplayMode,
  ActivitySearchRecordingMode,
  type DateRange,
  getLatestDateForLocationInRecordingMode,
  queryValueIsDate,
  validateLocations,
} from "@/components/activitySearchUtils.ts";
import {
  displayLabelForClassificationLabel,
  flatClassifications,
  getClassifications,
} from "@api/Classifications.ts";
import ActivitySearchDescription from "@/components/ActivitySearchDescription.vue";
import { delayMs } from "@/utils.ts";
import { tagsForRecording } from "@models/recordingUtils.ts";

const mapBuffer = ref<HTMLDivElement>();
const searchContainer = ref<HTMLDivElement>();
const searchControls = ref<HTMLDivElement>();
const searchResults = ref<HTMLDivElement>();
const { left: searchContainerLeft, right: searchContainerRight } =
  useElementBounding(searchContainer);
const { height: windowHeight, width: windowWidth } = useWindowSize();

const mapBufferWidth = computed<number>(() => {
  const right = windowWidth.value - searchContainerRight.value;
  return Math.max(0, mapWidthPx.value - right);
});

const currentProject = inject(currentActiveProject) as ComputedRef<
  SelectedProject | false
>;

const fileSafeProjectName = inject(
  urlNormalisedCurrentSelectedProjectName
) as ComputedRef<string>;

export interface ActivitySearchParams {
  // relativeDateRange: [Date, Date] | null;
  // absoluteDateRange: [Date, Date] | null;
  from: string | Date | undefined;
  until: string | Date | undefined;
  locations: ("any" | LocationId)[];
  tagMode: TagMode;
  taggedWith: ("any" | string)[];
  subClassTags: boolean;
  duration: "any" | [number, number] | ["any", number] | [number, "any"];
  includeFalsePositives: boolean;
  offset: Date; // Cursor
  labelledWith: string[] | null;
  devices: "all" | DeviceId[];
  recordingMode: ActivitySearchRecordingMode;
  displayMode: ActivitySearchDisplayMode;
}

const locations = ref<LoadedResource<ApiLocationResponse[]>>(null);

const arrayContentsAreTheSame = (
  a: LocationQueryValue[],
  b: LocationQueryValue[]
): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (const item of a) {
    if (!b.includes(item)) {
      return false;
    }
  }
  return true;
};
const diffChanges = (next: LocationQuery, prev: LocationQuery) => {
  const diff: Record<string, LocationQueryValue | LocationQueryValue[]> = {};
  const allKeys = {
    ...next,
    ...prev,
  };
  next = next as LocationQuery;
  prev = prev as LocationQuery;
  for (const key of Object.keys(allKeys)) {
    if (
      Array.isArray(next[key]) &&
      Array.isArray(prev[key]) &&
      !arrayContentsAreTheSame(
        next[key] as LocationQueryValue[],
        prev[key] as LocationQueryValue[]
      )
    ) {
      diff[key] = next[key];
    } else if (next[key] !== prev[key]) {
      if (next[key]) {
        diff[key] = next[key];
      } else {
        diff[key] = null;
      }
    }
  }
  return diff;
};

const DefaultSearchParams = {
  "display-mode": ActivitySearchDisplayMode.Visits,
  "recording-mode": ActivitySearchRecordingMode.Cameras,
  locations: "any",
  from: "24-hours-ago",
};

const searchParams = ref<ActivitySearchParams>({
  devices: "all",
  duration: "any",
  includeFalsePositives: false,
  labelledWith: null,
  offset: new Date(),
  tagMode: TagMode.Any,
  taggedWith: ["any"],
  subClassTags: true,
  until: undefined,
  displayMode: ActivitySearchDisplayMode.Visits,
  recordingMode: ActivitySearchRecordingMode.Cameras,
  locations: ["any"],
  from: "24-hours-ago",
});

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

const maxDateForProject = computed<Date>(() => {
  // Latest active location
  let latest = new Date();
  latest.setFullYear(2010);
  if (locations.value) {
    for (const location of locations.value) {
      const latestDateForLocation = getLatestDateForLocationInRecordingMode(
        location,
        searchParams.value.recordingMode
      );
      if (latestDateForLocation && latestDateForLocation > latest) {
        latest = latestDateForLocation;
      }
    }
  }
  return latest;
});

const availableDateRanges = computed<
  { range: [Date, Date]; from: string; label: string }[]
>(() => {
  const earliest = minDateForProject.value;
  const latest = maxDateForProject.value;
  const ranges = [] as { range: [Date, Date]; from: string; label: string }[];
  if (earliest < oneDayAgo && latest > oneDayAgo) {
    ranges.push({
      range: lastTwentyFourHours,
      from: "24-hours-ago",
      label: "in the last 24 hours",
    });
  }
  if (earliest < threeDaysAgo && latest > threeDaysAgo) {
    ranges.push({
      range: [threeDaysAgo, now],
      from: "3-days-ago",
      label: "in the last 3 days",
    });
  }
  if (earliest < oneWeekAgo && latest > oneWeekAgo) {
    ranges.push({
      range: [oneWeekAgo, now],
      from: "1-week-ago",
      label: "in the last week",
    });
  }
  if (earliest < oneMonthAgo && latest > oneMonthAgo) {
    ranges.push({
      range: [oneMonthAgo, now],
      from: "1-month-ago",
      label: "in the last month",
    });
  }
  if (earliest < threeMonthsAgo && latest > threeMonthsAgo) {
    ranges.push({
      range: [threeMonthsAgo, now],
      from: "3-months-ago",
      label: "in the last 3 months",
    });
  }
  if (earliest < oneYearAgo && latest > oneYearAgo) {
    ranges.push({
      range: [oneYearAgo, now],
      from: "1-year-ago",
      label: "in the last year",
    });
  }
  ranges.push({ range: [earliest, now], from: "any", label: "at any time" });
  return ranges;
});

const deserialiseAndValidateRouteValue = (
  key: string,
  value: LocationQueryValue | LocationQueryValue[]
): { replacement: string | null | false } => {
  if (Array.isArray(value)) {
    value = value.join(",");
  }
  // if (value === null) {
  //   return { replacement: null };
  // } else
  if (["display-mode", "recording-mode"].includes(key)) {
    // const parts = key.split("-");
    // const first = parts.shift() as string;
    // const camelKey: string = first + parts.map(upperFirst);
    switch (key) {
      case "display-mode":
        if (
          Object.values(ActivitySearchDisplayMode).includes(
            value as ActivitySearchDisplayMode
          )
        ) {
          searchParams.value.displayMode = value as ActivitySearchDisplayMode;
        } else {
          // Replace with default value
          return {
            replacement: ActivitySearchDisplayMode.Visits,
          };
        }
        break;
      case "recording-mode":
        if (
          Object.values(ActivitySearchRecordingMode).includes(
            value as ActivitySearchRecordingMode
          )
        ) {
          searchParams.value.recordingMode =
            value as ActivitySearchRecordingMode;
        } else {
          // Replace with default value
          return {
            replacement: ActivitySearchRecordingMode.Cameras,
          };
        }
        break;
    }
  } else if (key === "from") {
    value = value || "";
    const knownLabels = availableDateRanges.value.reduce(
      (arr: Record<string, DateRange>, { from, range }) => {
        arr[from] = range;
        return arr;
      },
      {}
    );
    if (value in knownLabels) {
      dateRange.value = [...knownLabels[value]];
      searchParams.value.from = value;
    } else {
      const date = new Date(value);
      if (!value || (value && value.trim() === "") || Number.isNaN(date)) {
        return { replacement: availableDateRanges.value[0].from };
      }
      dateRange.value = [date, dateRange.value[1]];
      searchParams.value.from = date;
    }
  } else if (key === "until") {
    value = value || "";
    const date = new Date(value);
    if (!value || (value && value.trim() === "") || Number.isNaN(date)) {
      return { replacement: null };
    }
    dateRange.value = [dateRange.value[0], date];
    searchParams.value.until = date;
  } else if (key === "locations") {
    value = value || [];
    // Check that the location ids are valid.
    let ids: number[];
    if (Array.isArray(value)) {
      ids = value.map(Number);
    } else {
      ids = value.toString().split(",").map(Number);
    }
    // Also need to make sure locations is computed after the timespan
    // that lets us know which locations are valid for that timespan.
    // Maybe need to do this in two passes.
    if (locationsInSelectedTimespan.value.length) {
      const availableLocations = locationsInSelectedTimespan.value.map(
        ({ id }) => id
      );
      const validIds = ids.filter((id) => availableLocations.includes(id));
      if (validIds.length === ids.length) {
        searchParams.value.locations = ids;
      } else {
        if (validIds.length !== 0) {
          return { replacement: validIds.join(",") };
        } else {
          // No locations were valid, default to any location
          searchParams.value.locations = ["any"];
          return { replacement: "any" };
        }
      }
    } else {
      console.error("Invalid timespan?", value);
    }
  } else if (key === "tag-mode") {
    // Map the tagged by into searchParams.
    const taggedBy = (value || "").trim() as TagMode;
    const tagModeIsValid = Object.values(TagMode).includes(taggedBy);
    if (tagModeIsValid) {
      searchParams.value.tagMode = taggedBy;
    } else {
      return { replacement: "any" };
    }
  } else if (key === "no-false-positives") {
    searchParams.value.includeFalsePositives = value === "false";
  } else if (key === "include-descendant-tags") {
    searchParams.value.subClassTags = value !== "false";
  } else if (key === "tagged-with") {
    value = value || "";
    const allTags = value.split(",").map((tag) => tag.trim().toLowerCase());
    const validTags = allTags.filter((tag) => tag in flatClassifications.value);
    if (validTags.length === allTags.length) {
      searchParams.value.taggedWith = value.split(",").map((x) => x.trim());
    } else {
      if (validTags.length) {
        return { replacement: validTags.join(",") };
      } else {
        searchParams.value.taggedWith = [];
        return { replacement: null };
      }
    }
  } else if (key === "labelled-with") {
    const allLabels = (value || "")
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length !== 0);
    searchParams.value.labelledWith = allLabels;
    if (!allLabels.length) {
      return { replacement: null };
    }
  } else {
    return { replacement: null };
  }
  return { replacement: false };
};
const syncSearchQuery = async (
  next: LocationQuery,
  prev: LocationQuery | undefined
) => {
  if (prev === undefined) {
    prev = DefaultSearchParams as LocationQuery;
  }
  // IMPORTANT: We need to make sure the dateRange is set correctly first.
  // But to get the dateRange, we need to have validated that any locations passed in
  // are valid for the dateRange.

  // So: get the internal dateRange from `next`, then do a second pass to validate it?
  // So if we pass in location A, and the last-24-hours, we want to expand that to be whatever
  // minimum date range makes sense for location A.

  // If we pass in location `any`, and the last 24 hours, we select the minimum valid date range for any locations.
  // using minDateForProject.
  // First we filter out any invalid locations in location, and if all locations are selected, we replace with `any`.
  const diff = diffChanges(next, prev);
  const replacements: Record<string, string | null> = {};
  if (diff.locations) {
    diff.locations = validateLocations(diff.locations, locations.value || []);
  }
  if (next.from) {
    // Set the lower time bound first
    deserialiseAndValidateRouteValue("from", next.from);
  }
  if (next.until) {
    // Set the upper time bound next
    deserialiseAndValidateRouteValue("until", next.until);
  }

  for (const [key, val] of Object.entries(diff)) {
    const replacement = deserialiseAndValidateRouteValue(key, val);
    if (replacement.replacement !== false) {
      replacements[key] = replacement.replacement;
    }
  }
  if (replacements["tagged-with"]) {
    replacements["tag-mode"] = TagMode.Tagged;
  }

  const isDateRange =
    queryValueIsDate(next.from) && queryValueIsDate(next.until);
  if (Object.entries(replacements).length) {
    const query: LocationQuery = {
      ...DefaultSearchParams,
      ...route.query,
      ...replacements,
    };
    for (const [key, val] of Object.entries(query)) {
      if (val === null) {
        delete query[key];
      }
    }
    if (!isDateRange && "until" in query) {
      delete query.until;
      delete searchParams.value.until;
    }

    await router.replace({
      query,
    });
  }
};
const router = useRouter();
const route = useRoute();
const watchQuery = ref<WatchStopHandle | null>(null);

const loading = ref<boolean>(false);

const dateRangeInternal = ref<[Date | null, Date | null]>([null, null]);
const dateRange = computed({
  get: (): [Date | null, Date | null] => {
    return [...dateRangeInternal.value] as [Date, Date];
  },
  set: (val: [Date | null, Date | null]) => {
    dateRangeInternal.value = val;
  },
});

watch(dateRange, (next, prev) => {
  if (prev[0] === null && prev[1] === null) {
    // Initialising date range
    if (next[0] !== null && next[1] !== null) {
      currentQueryCursor.value = {
        untilDateTime: endOfDay(next[1]),
        fromDateTime: endOfDay(next[1]),
      };
    }
  }
  if (next[0] !== null && next[1] !== null) {
    doSearch();
  }
});

const mapLocationForMap = (location: ApiLocationResponse): NamedPoint => {
  return {
    location: location.location,
    type: "station",
    project: (currentProject.value as SelectedProject).groupName,
    name: location.name,
    id: location.id,
  };
};

const locationHasRecordings = (location: ApiLocationResponse) => {
  if (searchParams.value.recordingMode === "audio") {
    return !!location.lastAudioRecordingTime;
  } else if (searchParams.value.recordingMode === "cameras") {
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

const selectedLocations = computed<(ApiLocationResponse | "any")[]>(() => {
  if (searchParams.value.locations.includes("any")) {
    return ["any"];
  }
  return searchParams.value.locations
    .map((locId) =>
      locationsInSelectedTimespan.value.find(({ id }) => id === locId)
    )
    .filter((item) => !!item) as ApiLocationResponse[];
});

const locationsInSelectedTimespan = computed<ApiLocationResponse[]>(() => {
  if (dateRange.value[0] === null || dateRange.value[1] === null) {
    return [];
  }
  if (locations.value) {
    return (locations.value as ApiLocationResponse[]).filter((location) => {
      if (location.location.lat === 0 && location.location.lng === 0) {
        return false;
      }
      const latestDateForLocation = getLatestDateForLocationInRecordingMode(
        location,
        searchParams.value.recordingMode
      );
      return (
        latestDateForLocation &&
        latestDateForLocation >= (dateRange.value[0] as Date) &&
        new Date(location.activeAt) <= (dateRange.value[1] as Date)
      );
    });
  }
  return [];
});

const locationsInSelectedTimespanForMap = computed<NamedPoint[]>(() => {
  return locationsInSelectedTimespan.value
    .filter((location) => {
      // Locations filtered by selected locations.
      if (selectedLocations.value.length) {
        if (selectedLocations.value.includes("any")) {
          return true;
        } else {
          return !!(selectedLocations.value as ApiLocationResponse[]).find(
            ({ id }) => id === location.id
          );
        }
      }
    })
    .map(mapLocationForMap);
});

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

const maxDateForSelectedLocations = computed<Date>(() => {
  // Latest active location
  if (selectedLocations.value.includes("any")) {
    return new Date(maxDateForProject.value);
  }
  let latest = new Date(0);
  if (selectedLocations.value) {
    for (const location of selectedLocations.value) {
      const loc = location as ApiLocationResponse;
      const lastActiveAudio =
        (loc.lastActiveAudioTime && new Date(loc.lastActiveAudioTime)) ||
        new Date(0);
      const lastActiveThermal =
        (loc.lastActiveThermalTime && new Date(loc.lastActiveThermalTime)) ||
        new Date(0);
      const lastThermalRecording =
        (loc.lastThermalRecordingTime &&
          new Date(loc.lastThermalRecordingTime)) ||
        new Date(0);
      const lastAudioRecording =
        (loc.lastAudioRecordingTime && new Date(loc.lastAudioRecordingTime)) ||
        new Date(0);
      const activeAt = maxDate(
        lastActiveAudio,
        maxDate(
          lastActiveThermal,
          maxDate(lastThermalRecording, lastAudioRecording)
        )
      );
      if (activeAt > latest) {
        latest = activeAt;
      }
    }
  }
  return latest;
});
const highlightPoint = (_point: NamedPoint | null) => {
  // TODO: Could highlight all visible list items that correspond to the highlighted map location?
};
const canonicalLatLngForActiveLocations = canonicalLatLngForLocations(
  locationsInSelectedTimespan
);

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
    currentQueryCursor.value.fromDateTime !== null &&
    currentQueryCursor.value.fromDateTime.getTime() >
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

interface RecordingQueryCursor {
  fromDateTime: Date | null;
  untilDateTime: Date | null;
}
const endOfDay = (d: Date): Date => {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
};
const startOfDay = (d: Date): Date => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};
const currentQueryHash = ref<string>("");
const currentQueryCursor = ref<RecordingQueryCursor>({
  fromDateTime: null,
  untilDateTime: null,
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
    if (inRecordingsMode.value) {
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
    } else if (inVisitsMode.value) {
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
  const untilDateTime = endOfDay(dateRange.value[1] as Date);
  return JSON.stringify({
    ...getCurrentQuery(),
    displayMode: displayMode.value,
    //fromDateTime,
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
  tagMode?: TagMode;
  tags?: string[];
  subClassTags?: boolean;
  includeFilteredFalsePositivesAndNones: boolean;
}
const getCurrentQuery = (): QueryRecordingsOptions => {
  // console.log("Search params", searchParams.value);
  const query: QueryRecordingsOptions = {
    types:
      searchParams.value.recordingMode === "cameras"
        ? [
            ConcreteRecordingType.ThermalRaw,
            ConcreteRecordingType.TrailCamVideo,
            ConcreteRecordingType.TrailCamImage,
          ]
        : [ConcreteRecordingType.Audio],
  };
  if (searchParams.value.displayMode === "recordings") {
    query.includeFilteredFalsePositivesAndNones =
      searchParams.value.includeFalsePositives ||
      searchParams.value.tagMode === TagMode.UnTagged;
  }
  const isAnyLocation = selectedLocations.value.includes("any");
  if (!isAnyLocation) {
    query.locations = selectedLocations.value.map(
      (loc) => (loc as ApiLocationResponse).id
    );
  }
  const taggedWithAny = searchParams.value.taggedWith.includes("any");
  if (!taggedWithAny) {
    query.taggedWith = searchParams.value.taggedWith || [];
  }
  const tagModeAny = searchParams.value.tagMode === TagMode.Any;
  if (!tagModeAny) {
    query.tagMode = searchParams.value.tagMode;
    if (!taggedWithAny) {
      query.subClassTags = searchParams.value.subClassTags;
    }
  }
  if (searchParams.value.labelledWith?.length) {
    query.labelledWith = searchParams.value.labelledWith;
  }

  // Hack in support for Megadetector "animal" into our heirarchy:
  if (query.taggedWith?.includes("animal") && query.subClassTags) {
    const animalChildren = [
      "mammal",
      "bird",
      "frog",
      "insect",
      "lizard",
      "part",
      "pest",
    ];
    query.taggedWith = query.taggedWith.filter(
      (tag) => !animalChildren.includes(tag)
    );
    query.taggedWith = [...query.taggedWith, ...animalChildren];
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
    fromDateTime: new Date(fromDateTime),
    untilDateTime: new Date(untilDateTime),
  };
};

const displayMode = computed<ActivitySearchDisplayMode>(
  () => searchParams.value.displayMode
);
const inRecordingsMode = computed<boolean>(
  () => displayMode.value === ActivitySearchDisplayMode.Recordings
);
const inVisitsMode = computed<boolean>(
  () => displayMode.value === ActivitySearchDisplayMode.Visits
);

const maxDate = (a: Date, b: Date): Date => {
  if (a > b) {
    return a;
  }
  return b;
};

const minDate = (a: Date, b: Date): Date => {
  if (a < b) {
    return a;
  }
  return b;
};

const typesForRecordingMode = computed<ConcreteRecordingType[]>(() => {
  if (searchParams.value.recordingMode === "cameras") {
    return [
      ConcreteRecordingType.ThermalRaw,
      ConcreteRecordingType.TrailCamVideo,
      ConcreteRecordingType.TrailCamImage,
    ];
  } else {
    return [ConcreteRecordingType.Audio];
  }
});

const firstLoad = ref<boolean>(true);
const getRecordingsOrVisitsForCurrentQuery = async () => {
  // NOTE: We try to load at most one month at a time.
  if (currentProject.value) {
    const fromDateTime = dateRange.value[0];
    const untilDateTime = dateRange.value[1];
    if (fromDateTime === null && untilDateTime === null) {
      // Date range not yet defined
      return;
    }
    let queryHash = getCurrentQueryHash();
    let query = getCurrentQuery();
    const project = currentProject.value as SelectedProject;
    let isNewQuery;
    if (firstLoad.value) {
      firstLoad.value = false;
      queryHash = getCurrentQueryHash();
      query = getCurrentQuery();
      isNewQuery = true;
    } else {
      isNewQuery = queryHash !== currentQueryHash.value;
    }
    if (
      (currentQueryCursor.value.fromDateTime as Date) < (fromDateTime as Date)
    ) {
      // We need to narrow the already loaded search range
      isNewQuery = true;
    }

    let earliestRecord = null;
    if (inRecordingsMode.value) {
      if (loadedRecordings.value.length) {
        earliestRecord = new Date(
          loadedRecordings.value[
            loadedRecordings.value.length - 1
          ].recordingDateTime
        );
      }
    } else {
      // Visits
    }
    if (earliestRecord !== null && earliestRecord < (fromDateTime as Date)) {
      isNewQuery = true;
    }

    if (isNewQuery) {
      resetQuery(
        queryHash,
        endOfDay(untilDateTime as Date),
        endOfDay(untilDateTime as Date)
      );
    }

    const hasNotLoadedAllOfQueryTimeRange =
      (currentQueryCursor.value.fromDateTime as Date) > (fromDateTime as Date);

    if (hasNotLoadedAllOfQueryTimeRange) {
      // console.log("Count all", queryMap[key].loaded === 0);
      // First time through, we want to count all for a given timespan query.
      const itemHeight = inRecordingsMode.value ? 80 : 160;
      const twoPagesWorth = Math.ceil(windowHeight.value / itemHeight) * 2;
      let response:
        | FetchResult<BulkRecordingsResponse>
        | FetchResult<VisitsQueryResult>;
      if (inRecordingsMode.value) {
        // NOTE: Not sure we need to ever get the total count for this query for the
        //  purposes of this UI?
        response = await queryRecordingsInProjectNew(project.id, {
          ...query,
          countAll: isNewQuery,
          limit: twoPagesWorth,
          fromDateTime: dateRange.value[0],
          untilDateTime: currentQueryCursor.value.untilDateTime as Date,
          types: typesForRecordingMode.value as (
            | RecordingType.TrailCamImage
            | RecordingType.TrailCamVideo
            | RecordingType.ThermalRaw
            | RecordingType.Audio
          )[],
        });
        if (response.success && response.result.count) {
          currentQueryCount.value = response.result.count;
        }
      } else {
        // Else visits
        // TODO: This needs to have a limit
        // Make it the lesser of the current date range or 2 pages worth of days.
        //const pageSize = 100;
        response = await getVisitsForProject(
          project.id,
          dateRange.value[0] as Date,
          minDate(
            currentQueryCursor.value.untilDateTime as Date,
            endOfDay(maxDateForSelectedLocations.value)
          ),
          //pageSize,
          query.locations,
          query.types as
            | (
                | RecordingType.ThermalRaw
                | RecordingType.TrailCamImage
                | RecordingType.TrailCamVideo
              )[]
            | undefined
        );
      }
      if (response && response.success) {
        let loadedFewerItemsThanRequested;
        let gotUntilDate: Date | undefined;
        if (inRecordingsMode.value) {
          const recordingsResponse = response as unknown as SuccessFetchResult<{
            recordings: ApiRecordingResponse[];
          }>;
          // loadedFewerItemsThanRequested =
          //   recordingsResponse.result.recordings.length < 100;
          const recordings = recordingsResponse.result.recordings;
          loadedRecordings.value.push(...recordings);
          if (currentQueryCount.value) {
            loadedFewerItemsThanRequested =
              loadedRecordings.value.length < currentQueryCount.value;
          }
          loadedRecordingIds.value.push(...recordings.map(({ id }) => id));
          appendRecordingsChunkedByDay(recordings);
          currentQueryLoaded.value += recordings.length;
          if (recordings.length !== 0) {
            gotUntilDate = new Date(
              recordings[recordings.length - 1].recordingDateTime
            );
          }
        } else if (inVisitsMode.value) {
          const visitsResponse = response.result as VisitsQueryResult;
          const visits = visitsResponse.visits as ApiVisitResponse[];
          loadedFewerItemsThanRequested =
            visitsResponse.params.pagesEstimate > 1;

          if (visits.length !== 0) {
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
          const reachedMinDateForSelectedLocations =
            (currentQueryCursor.value.fromDateTime as Date).getTime() ===
            minDateForSelectedLocations.value.getTime();
          if (loadedFewerItemsThanRequested) {
            if (reachedMinDateForSelectedLocations) {
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
          if (
            dateRange.value[0] &&
            dateRange.value[0].getTime() ===
              minDateForSelectedLocations.value.getTime()
          ) {
            currentQueryCursor.value.fromDateTime = new Date(
              minDateForSelectedLocations.value
            );
          } else {
            currentQueryCursor.value.fromDateTime = new Date(
              currentQueryCursor.value.untilDateTime as Date
            );
          }
          completedCurrentQuery.value = true;
        }
      }
    }
  }
};

const searching = ref<boolean>(false);
const exporting = ref<boolean>(false);
const exportProgress = ref<number>(0);
const exportStartTime = ref<number>(0);
const exportTime = ref<number>(0);
const exportProgressZeroOneHundred = computed<number>(
  () => exportProgress.value * 100
);
const doSearch = async () => {
  if (!searching.value) {
    searching.value = true;
    await getClassifications();
    await getRecordingsOrVisitsForCurrentQuery();
    searching.value = false;
  }
};

const download = (url: string, filename: string) => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  anchor.click();
};

const arrayToCsv = (data: string[][]) => {
  return data
    .map(
      (row) =>
        row
          .map(String) // convert every value to String
          .map((v) => v.replaceAll('"', '""')) // escape double quotes
          .map((v) => `"${v}"`) // quote it
          .join(",") // comma-separated
    )
    .join("\r\n"); // rows starting on new lines
};
const upperFirst = (str: string): string => {
  const trim = str.trim();
  return trim.charAt(0).toUpperCase() + trim.slice(1);
};
const createVisitsCsv = (data: ApiVisitResponse[]): string => {
  const csv = [
    [
      "Location",
      "Start time",
      "End time",
      "Local start time",
      "Local end time",
      "Duration",
      "Visit classification",
      "Classified by",
      "# Recordings",
    ],
  ];
  for (const visit of data) {
    const classificationAgreesWithAi =
      visit.classificationAi === visit.classification && visit.classFromUserTag;
    const classificationType = visit.classFromUserTag
      ? classificationAgreesWithAi
        ? "User & AI"
        : "User"
      : visit.classificationAi
      ? "AI"
      : "unknown";
    const location = (locations.value || []).find(
      ({ id }) => id === visit.stationId
    );
    if (location) {
      csv.push([
        visit.stationName,
        visit.timeStart,
        visit.timeEnd,
        dayAndTimeAtLocation(visit.timeStart, location.location),
        dayAndTimeAtLocation(visit.timeEnd, location.location),
        visitDuration(visit).replace("&nbsp;", " "),
        upperFirst(
          (visit.classification &&
            displayLabelForClassificationLabel(
              visit.classification,
              !visit.classFromUserTag
            )) ||
            "none"
        ),
        classificationType,
        (visit.recordings?.length || 0).toString(),
      ]);
    }
  }
  return arrayToCsv(csv);
};

const createRecordingsCsv = (data: ApiRecordingResponse[]): string => {
  // TODO: More columns as needed
  const csv = [
    [
      "Location",
      "Latitude/Longitude",
      "Device name",
      "Time",
      "Local time",
      "Duration",
      "Classification",
      "Labels",
    ],
  ];
  for (const recording of data) {
    const location = (locations.value || []).find(
      ({ id }) => id === recording.stationId
    );
    if (location) {
      const tags = tagsForRecording(recording);
      const displays = [];
      const labels = recording.tags.map((tag) => tag.detail);
      for (const tag of tags) {
        const display = displayLabelForClassificationLabel(
          tag.what,
          tag.automatic && !tag.human
        );
        displays.push(
          `${upperFirst(display)}${tag.count > 1 ? ` (${tag.count})` : ""}`
        );
      }

      csv.push([
        recording.stationName || "",
        `${recording.location?.lat}, ${recording.location?.lng}`,
        recording.deviceName,
        recording.recordingDateTime,
        dayAndTimeAtLocation(recording.recordingDateTime, location.location),
        formatDuration(recording.duration * 1000).replace("&nbsp;", " "),
        displays.join(", "),
        labels.join(", "),
      ]);
    }
  }
  return arrayToCsv(csv);
};

const exportTimeElapsed = computed<number>(
  () => exportTime.value - exportStartTime.value
);

const doExport = async () => {
  exportProgress.value = 0;
  exporting.value = true;
  exportStartTime.value = performance.now();
  await getClassifications();
  if (
    currentProject.value &&
    dateRange.value[0] !== null &&
    dateRange.value[1] !== null
  ) {
    const fromDateTime = dateRange.value[0];
    const untilDateTime = dateRange.value[1];
    const query = getCurrentQuery();
    const project = currentProject.value as SelectedProject;
    exportProgress.value = 0;
    if (inVisitsMode.value) {
      // Get all the responses
      const visitsResponse = await getAllVisitsForProjectBetweenTimes(
        project.id,
        fromDateTime,
        untilDateTime,
        query.locations,
        query.types as
          | (
              | RecordingType.TrailCamVideo
              | RecordingType.ThermalRaw
              | RecordingType.TrailCamImage
            )[]
          | undefined,
        (progress) => {
          exportProgress.value = progress;
          exportTime.value = performance.now();
        }
      );
      const csvFileData = createVisitsCsv(
        visitsResponse.visits as ApiVisitResponse[]
      );
      download(
        URL.createObjectURL(
          new Blob([csvFileData], { type: "text/csv;charset=utf-8;" })
        ),
        `${fileSafeProjectName.value}-visits-export.csv`
      );
    } else if (inRecordingsMode.value) {
      query.fromDateTime = fromDateTime;
      query.untilDateTime = untilDateTime;
      const recordings = await getAllRecordingsForProjectBetweenTimes(
        project.id,
        query,
        (progress) => {
          exportProgress.value = progress;
          exportTime.value = performance.now();
        }
      );
      const csvFileData = createRecordingsCsv(recordings);
      download(
        URL.createObjectURL(
          new Blob([csvFileData], { type: "text/csv;charset=utf-8;" })
        ),
        `${fileSafeProjectName.value}-recordings-export.csv`
      );
    }
  }
  await delayMs(1000).promise;
  exporting.value = false;
};

const fromDateMinusIncrement = computed<Date>(() => {
  // What was the selected increment?  One day? One month?  One year?
  // Use that initial increment to expand search backwards in time by that amount.
  //const currentInc =
  const fromDateTime = new Date(dateRange.value[0] as Date);
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

const currentlySelectedRecording = computed<RecordingId | null>(
  () =>
    (route.params.currentRecordingId &&
      Number(route.params.currentRecordingId)) ||
    null
);

// TODO: Load offset date from url params, and have the ability to also scroll upwards and load more,
//  as well as expand the search forwards in time.

const isCustomDateRange = computed<boolean>(
  () =>
    queryValueIsDate(searchParams.value.from) &&
    queryValueIsDate(searchParams.value.until)
);
const customAutomaticallySet = ref<boolean>(false);

const adjustTimespanBackwards = async () => {
  // FIXME - when we adjust the timespan backwards, we need to make sure we keep the existing
  //  locations selection.
  if (isCustomDateRange.value) {
    searchParams.value.from = fromDateMinusIncrement.value;
  } else {
    searchParams.value.from = fromDateMinusIncrement.value;
    searchParams.value.until = dateRange.value[1] as Date;
    //
    // const initialSelectedDateRangeUntil = new Date(selectedDateRange.value[1]);
    customAutomaticallySet.value = true;
    // selectedDateRange.value = "custom";
    // if (customDateRange.value) {
    //   customDateRange.value[0] = fromDateMinusIncrement.value;
    // } else {
    //   customDateRange.value = [
    //     fromDateMinusIncrement.value,
    //     initialSelectedDateRangeUntil,
    //   ];
    //   // NOTE: We need to wait a tick for computed items to resolve.
    //   await nextTick();
    //   customDateRange.value = [
    //     fromDateMinusIncrement.value,
    //     initialSelectedDateRangeUntil,
    //   ];
    // }
  }
  // console.log("Cursor was", JSON.stringify(currentQueryCursor.value, null, '\t'));
  //currentQueryCursor.value.fromDateTime = fromDateMinusIncrement.value;
  dateRange.value = [fromDateMinusIncrement.value, dateRange.value[1]];
  // Reset the key, so that we continue the current search
  //currentQueryHash.value = getCurrentQueryHash();
  //console.log("Cursor is now", JSON.stringify(currentQueryCursor.value, null, '\t'));

  // TODO - When we expand a search, we need to issue another count request for the span added, so we
  // can update the total.
  // console.log("adjustTimespanBackwards");
  // await doSearch();
};

// FIXME: Handle recording closing etc, restoring route.
const selectedRecording = async (recordingId: RecordingId) => {
  console.log("Selected recording", recordingId);
  await router.push({
    name: "activity-recording",
    params: {
      currentRecordingId: recordingId,
    },
    query: route.query,
  });
};

const selectedVisit = (visit: ApiVisitResponse) => {
  currentlySelectedVisit.value = visit;
};

watch(
  currentlySelectedVisit,
  (visit: ApiVisitResponse | null, _prevVisit: ApiVisitResponse | null) => {
    if (visit && route.name === "activity") {
      // Set route so that modal shows up
      const recordingIds = visit.recordings.map(({ recId, tracks }) => ({
        recId,
        tracks,
      }));
      const params: Record<string, string> = {
        visitLabel: visit.classification || "",
        currentRecordingId: recordingIds[0].recId.toString(),
        trackId: (recordingIds[0].tracks &&
          recordingIds[0].tracks.length &&
          recordingIds[0].tracks[0].id.toString()) as string,
      };
      if (recordingIds.length) {
        params.recordingIds = recordingIds.map(({ recId }) => recId).join(",");
      }
      router.push({
        name: "activity-visit",
        params,
        query: route.query,
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

const mapWidthPx = computed<number>(() => {
  if (windowWidth.value >= 1200) {
    return Math.min(
      500,
      windowWidth.value - (searchContainerLeft.value + 810 + 24)
    );
  } else if (windowWidth.value >= 992) {
    return 250;
  } else {
    return 0;
  }
});

const showOffcanvasSearch = ref<boolean>(false);
const toggleOffcanvasSearch = () => {
  showOffcanvasSearch.value = !showOffcanvasSearch.value;
};
const shouldShowSearchControlsInline = computed<boolean>(
  () => windowWidth.value >= 768
);

const localDateString = (d: Date): string => {
  return DateTime.fromJSDate(d).toLocaleString({
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

onBeforeMount(async () => {
  loading.value = true;
  if (currentProject.value) {
    // TODO: This could be provided for group at a higher level.
    locations.value = await getLocationsForProject(
      (currentProject.value as SelectedProject).id.toString(),
      true
    );
    console.log("Got locations, validate query", locations.value);
    // Validate the current query on load.
    watchQuery.value = watch(() => route.query, syncSearchQuery, {
      deep: true,
      immediate: true,
    });
  }
  loading.value = false;
});
onBeforeUnmount(() => {
  //watchParams();
  watchQuery.value && watchQuery.value();
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
    <b-spinner variant="secondary" />
  </div>
  <div v-else-if="!projectHasLocationsWithRecordings">
    This project has no activity yet.
  </div>
  <div
    v-else
    class="d-flex flex-md-row flex-column-reverse flex-fill search-container"
    ref="searchContainer"
  >
    <nav
      class="navbar navbar-expand-md search-controls-outer me-md-3 d-flex py-md-0 align-items-md-start"
      ref="searchControls"
    >
      <div class="search-results-toggle position-fixed d-md-none d-block">
        <b-button @click="toggleOffcanvasSearch">
          <font-awesome-icon icon="sliders" />
        </b-button>
      </div>
      <b-offcanvas
        v-if="!shouldShowSearchControlsInline"
        v-model="showOffcanvasSearch"
        :placement="'end'"
        :teleport-disabled="true"
        title="Activity search"
        :body-class="'search-offcanvas'"
      >
        <activity-search-parameters
          :params="searchParams"
          :locations="ref(locations)"
          :searching="searching"
          :custom-set="customAutomaticallySet"
          @accepted-custom-set="customAutomaticallySet = false"
          @search-requested="doSearch"
          @export-requested="doExport"
        />
        <div class="d-flex flex-column mt-3">
          <b-button @click="showOffcanvasSearch = false">Search</b-button>
        </div>
      </b-offcanvas>
      <div class="search-controls" v-if="shouldShowSearchControlsInline">
        <activity-search-parameters
          :params="searchParams"
          :locations="ref(locations)"
          :searching="searching"
          :custom-set="customAutomaticallySet"
          @accepted-custom-set="customAutomaticallySet = false"
          @search-requested="doSearch"
          @export-requested="doExport"
        />
      </div>
    </nav>
    <div
      class="search-results flex-grow-1 d-flex justify-content-center pb-3 me-lg-3"
      ref="searchResults"
    >
      <div class="search-results-inner d-flex flex-grow-1 flex-column">
        <activity-search-description
          :locations-in-selected-timespan="locationsInSelectedTimespan"
          :selected-locations="selectedLocations"
          :available-date-ranges="availableDateRanges"
          :search-params="searchParams"
        />
        <div class="search-items-container">
          <recordings-list
            v-if="inRecordingsMode"
            :recordings-by-day="chunkedRecordings"
            @change-highlighted-location="
              (loc: LocationId | null) => (currentlyHighlightedLocation = loc)
            "
            @selected-recording="selectedRecording"
            :currently-selected-recording-id="currentlySelectedRecording"
            :canonical-location="canonicalLatLngForActiveLocations"
          />
          <visits-breakdown-list
            v-else-if="inVisitsMode"
            :visits="chunkedVisits"
            :location="canonicalLatLngForActiveLocations"
            :highlighted-location="currentlyHighlightedLocation"
            @selected-visit="selectedVisit"
            @change-highlighted-location="
              (loc: LocationId | null) => (currentlyHighlightedLocation = loc)
            "
          />
        </div>
        <div
          v-if="searching"
          class="d-flex justify-content-center flex-columns align-items-center flex-fill"
        >
          <b-spinner variant="secondary" />
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
            class="btn btn-outline-secondary"
          >
            Expand the search start back to
            {{ relativeTimeIncrementInPast }}
          </button>
        </div>
        <div
          v-else-if="
            (searchParams.displayMode === 'recordings' &&
              loadedRecordings.length) ||
            (searchParams.displayMode === 'visits' && chunkedVisits.length)
          "
        >
          <span class="text-center mb-2"
            >No results before this time for the current search.</span
          >
        </div>
      </div>
    </div>
    <div
      class="map-buffer"
      ref="mapBuffer"
      :style="{ width: `${mapBufferWidth}px` }"
    ></div>
  </div>
  <map-with-points
    v-if="projectHasLocationsWithRecordings && mapWidthPx !== 0"
    :points="locationsForMap"
    :active-points="locationsInSelectedTimespanForMap"
    :highlighted-point="highlightedPoint"
    :width="mapWidthPx"
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
  <b-modal
    v-model="exporting"
    centered
    no-close-on-esc
    title="Exporting data"
    @hidden="() => (exportProgress = 0)"
    no-close-on-backdrop
    hide-footer
    hide-header-close
  >
    <activity-search-description
      :locations-in-selected-timespan="locationsInSelectedTimespan"
      :selected-locations="selectedLocations"
      :available-date-ranges="availableDateRanges"
      :search-params="searchParams"
    />
    <b-progress :value="exportProgressZeroOneHundred" />
    <span class="mt-1"
      >{{ Math.max(0, exportTimeElapsed / 1000).toFixed(1) }} seconds
      elapsed</span
    >
  </b-modal>
</template>
<style lang="less" scoped>
.search-results-toggle {
  top: 143px;
  right: 0;
  z-index: 1021;
  > .btn {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
}
.centered-overlay {
  height: calc(100svh - 90px);
}
.search-results-inner {
  @media screen and (min-width: 992px) {
    max-width: 430px;
    width: 430px;
  }
  @media screen and (min-width: 1200px) {
    max-width: 540px;
    width: 540px;
  }
}
.box {
  background: #ccc;
  min-height: 100px;
}
.map {
  height: 400px !important;
  position: unset;
  @media screen and (min-width: 768px) {
    position: absolute !important;
    right: 0;
    top: 0;
    height: 100svh !important;
  }
}
</style>
<style lang="less">
.search-controls {
  width: 250px !important;
  position: sticky;
  top: 15px;
}
.search-controls-outer {
  .b-overlay-wrap .b-overlay {
    z-index: 1040 !important;
  }
}
</style>

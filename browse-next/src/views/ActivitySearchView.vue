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
  allHistoricLocations,
  currentSelectedProject as currentActiveProject,
  latLngForActiveLocations,
  urlNormalisedCurrentSelectedProjectName,
} from "@models/provides";
import {
  projectDevicesLoaded,
  projectLocationsLoaded,
  type SelectedProject,
} from "@models/LoggedInUser";
import type {
  FetchResult,
  LoadedResource,
  SuccessFetchResult,
} from "@apiClient/types";
import {
  type RecordingType,
  RecordingType as ConcreteRecordingType,
  TagMode,
} from "@typedefs/api/consts.ts";
import type {
  DeviceId,
  LatLng,
  RecordingId,
  StationId as LocationId,
} from "@typedefs/api/common";
import InlineViewModal from "@/components/InlineViewModal.vue";
import type { MaybeElement } from "@vueuse/core";
import { useIntersectionObserver, useWindowSize } from "@vueuse/core";
import { DateTime } from "luxon";
import {
  timezoneForLatLng,
  visitClassificationLabelFromPath,
  visitClassificationPath,
} from "@models/visitsUtils";
import {
  canonicalLatLngForLocations,
  latLngApproxDistance,
} from "@/helpers/Location";
import * as sunCalc from "suncalc";
import {
  type LocationQuery,
  type LocationQueryValue,
  useRoute,
  useRouter,
} from "vue-router";
import RecordingsList from "@/components/RecordingsList.vue";
import VisitsBreakdownList from "@/components/VisitsBreakdownList.vue";
import ActivitySearchParameters from "@/components/ActivitySearchParameters.vue";
import {
  ActivitySearchDisplayMode,
  ActivitySearchRecordingMode,
  type DateRange,
  getLatestDateForLocationInRecordingMode,
  queryValueIsDate,
  validateLocations,
} from "@/components/activitySearchUtils.ts";
import {
  flatClassifications,
  getClassifications,
} from "@api/classificationsUtils";
import ActivitySearchDescription from "@/components/ActivitySearchDescription.vue";
import { delayMs } from "@/utils.ts";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import type {
  BulkRecordingsResponse,
  QueryRecordingsOptions,
} from "@apiClient/Recording.ts";
import { ClientApi } from "@/api";
import type { NonEmptyArray } from "@/helpers/utils.ts";
import {
  BButton,
  BModal,
  BOffcanvas,
  BProgress,
  BSpinner,
} from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import { CurrentViewAbortController } from "@apiClient/api.ts";
import type { IconsProp } from "@dbetka/vue-material-symbols/dist/jscache/icons-names";
import type { ApiStaticVisitResponse } from "@typedefs/api/visit";
import { recordingUpdatedInVisitsContext } from "@/helpers/patch-visits-context.ts";
import { createRecordingsCsv, createVisitsCsv } from "@/helpers/csv-exports.ts";

type RecordingItem = { type: "recording"; data: ApiRecordingResponse };
type SunItem = { type: "sunset" | "sunrise"; data: string };
type RecordingsChunk = {
  dateTime: DateTime;
  items: (RecordingItem | SunItem)[];
};

const mapBuffer = ref<HTMLDivElement>();
const mapContainer = ref<HTMLDivElement>();
const searchContainer = ref<HTMLDivElement>();
const searchControls = ref<HTMLDivElement>();
const searchResults = ref<HTMLDivElement>();
const { height: windowHeight, width: windowWidth } = useWindowSize();

const currentProject = inject(currentActiveProject) as ComputedRef<
  SelectedProject | false
>;

const fileSafeProjectName = inject(
  urlNormalisedCurrentSelectedProjectName,
) as ComputedRef<string>;

export interface ActivitySearchParams {
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

const locations = inject(allHistoricLocations) as ComputedRef<
  ApiLocationResponse[]
>;
const devices = ref<LoadedResource<ApiDeviceResponse[]>>(null);

const projectHasDevices = computed<boolean>(() => {
  return !!devices.value && devices.value.length !== 0;
});

const projectHasInternetConnectedDevices = computed<boolean>(() => {
  return (
    projectHasDevices.value &&
    (devices.value as ApiDeviceResponse[]).some(
      (device) => device.lastConnectionTime !== undefined,
    )
  );
});

watch(currentProject, async (next, prev) => {
  if (next && prev && next.groupName !== prev.groupName) {
    await Promise.all([projectLocationsLoaded(), projectDevicesLoaded()]);
    await loadActiveAndInactiveDevices();
    searchParams.value = initSearchParams();
    prefilteredChunkedVisits.value = [];
    chunkedRecordings.value = [];
    currentQueryCursor.value.fromDateTime = null;
    currentQueryCursor.value.untilDateTime = null;
    dateRange.value = [null, null];
    // FIXME: Maybe need to clear all search params, and reset internal queries such
    //  that locations and devices and timespans that belong to other projects are removed.
    await doSearch();
  }
});

const arrayContentsAreTheSame = (
  a: LocationQueryValue[],
  b: LocationQueryValue[],
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
        prev[key] as LocationQueryValue[],
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

const defaultSearchParams = computed(() => {
  const params: Record<string, string> = {
    "display-mode": defaultDisplayMode.value,
    "recording-mode": defaultRecordingMode.value,
    locations: "any",
    from: "3-days-ago",
  };
  if (defaultDisplayMode.value === ActivitySearchDisplayMode.Recordings) {
    if (defaultFalseTriggerMode()) {
      params["no-false-positives"] = "false";
    }
  }
  return params;
});

const locationHasAudioRecordings = (location: ApiLocationResponse) => {
  return !!location.lastAudioRecordingTime;
};
const locationHasCameraRecordings = (location: ApiLocationResponse) => {
  return !!location.lastThermalRecordingTime;
};
const route = useRoute();

const savedRecordingMode =
  (window.localStorage.getItem(
    "activity-recording-mode",
  ) as ActivitySearchRecordingMode) || ActivitySearchRecordingMode.Cameras;
const savedDisplayMode =
  (window.localStorage.getItem(
    "activity-display-mode",
  ) as ActivitySearchDisplayMode) || ActivitySearchDisplayMode.Visits;

const defaultDisplayMode = computed<ActivitySearchDisplayMode>(() => {
  if (route && route.query["display-mode"]) {
    if (route.query["display-mode"] === "recordings") {
      return ActivitySearchDisplayMode.Recordings;
    } else if (route.query["display-mode"] === "visits") {
      return ActivitySearchDisplayMode.Visits;
    }
  } else if (
    locations.value.some((location) => locationHasCameraRecordings(location))
  ) {
    return savedDisplayMode;
  } else if (
    locations.value.some((location) => locationHasAudioRecordings(location)) &&
    !locations.value.some((location) => locationHasCameraRecordings(location))
  ) {
    return ActivitySearchDisplayMode.Recordings;
  }
  return savedDisplayMode;
});

const defaultRecordingMode = computed<ActivitySearchRecordingMode>(() => {
  if (route && route.query["recording-mode"]) {
    if (route.query["recording-mode"] === "audio") {
      return ActivitySearchRecordingMode.Audio;
    } else if (route.query["recording-mode"] === "cameras") {
      return ActivitySearchRecordingMode.Cameras;
    }
  } else if (
    locations.value.some((location) => locationHasCameraRecordings(location)) &&
    !locations.value.some((location) => locationHasAudioRecordings(location))
  ) {
    return ActivitySearchRecordingMode.Cameras;
  } else if (
    locations.value.some((location) => locationHasAudioRecordings(location)) &&
    !locations.value.some((location) => locationHasCameraRecordings(location))
  ) {
    return ActivitySearchRecordingMode.Audio;
  }
  if (route && route.query["display-mode"] === "visits") {
    return ActivitySearchRecordingMode.Cameras;
  }
  return savedRecordingMode;
});

const defaultFalseTriggerMode = () => {
  const userPreference = window.localStorage.getItem(
    "activity-search-false-triggers",
  );
  if (userPreference) {
    try {
      return JSON.parse(userPreference);
    } catch (e) {
      //
    }
    return false;
  }
};

const initSearchParams = (): ActivitySearchParams => ({
  devices: "all",
  duration: "any",
  includeFalsePositives: defaultFalseTriggerMode(),
  labelledWith: null,
  offset: new Date(),
  tagMode: TagMode.Any,
  taggedWith: ["any"],
  subClassTags: true,
  until: undefined,
  displayMode: defaultDisplayMode.value,
  recordingMode: defaultRecordingMode.value,
  locations: ["any"],
  from: "3-days-ago",
});

const searchParams = ref<ActivitySearchParams>(initSearchParams());

const now = new Date();
const oneDayAgo = new Date(new Date().setDate(now.getDate() - 1));
const threeDaysAgo = new Date(new Date().setDate(now.getDate() - 3));
const oneWeekAgo = new Date(new Date().setDate(now.getDate() - 7));
const oneMonthAgo = new Date(new Date().setMonth(now.getMonth() - 1));
const threeMonthsAgo = new Date(new Date().setMonth(now.getMonth() - 3));
const oneYearAgo = new Date(new Date().setFullYear(now.getFullYear() - 1));
const lastTwentyFourHours: [Date, Date] = [oneDayAgo, now];

const maxDateForProject = computed<Date>(() => {
  // Latest active location
  let latest = new Date();
  latest.setFullYear(2010);
  let mode: ActivitySearchRecordingMode;
  if (displayMode.value === ActivitySearchDisplayMode.Visits) {
    mode = ActivitySearchRecordingMode.Cameras;
  } else {
    mode = recordingMode.value;
  }
  if (locations.value) {
    for (const location of locations.value) {
      const latestDateForLocation = getLatestDateForLocationInRecordingMode(
        location,
        mode,
      );
      if (latestDateForLocation && latestDateForLocation > latest) {
        latest = latestDateForLocation;
      }
    }
  }
  return latest;
});

interface DateRangeOption {
  range: DateRange;
  from: string;
  label: string;
}

const availableDateRanges = computed<NonEmptyArray<DateRangeOption>>(() => {
  const thermalMode =
    recordingMode.value === ActivitySearchRecordingMode.Cameras ||
    displayMode.value === ActivitySearchDisplayMode.Visits;
  const earliest = thermalMode
    ? minThermalDateForProject.value
    : minAudioDateForProject.value;
  const latest = maxDateForProject.value;
  const ranges = [] as DateRangeOption[];
  if (latest > oneDayAgo) {
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
  return ranges as NonEmptyArray<DateRangeOption>;
});

const deserialiseAndValidateRouteValue = (
  key: string,
  value: LocationQueryValue | LocationQueryValue[],
): { replacement: string | null | false } => {
  if (Array.isArray(value)) {
    value = value.join(",");
  }
  if (["display-mode", "recording-mode"].includes(key)) {
    switch (key) {
      case "display-mode":
        if (
          Object.values(ActivitySearchDisplayMode).includes(
            value as ActivitySearchDisplayMode,
          )
        ) {
          searchParams.value.displayMode = value as ActivitySearchDisplayMode;
        } else {
          // Replace with default value
          return {
            replacement: defaultDisplayMode.value,
          };
        }
        break;
      case "recording-mode":
        if (
          Object.values(ActivitySearchRecordingMode).includes(
            value as ActivitySearchRecordingMode,
          )
        ) {
          searchParams.value.recordingMode =
            value as ActivitySearchRecordingMode;
        } else {
          // Replace with default value
          return {
            replacement: defaultRecordingMode.value,
          };
        }
        break;
    }
  } else if (key === "from") {
    value = value || "";
    const knownLabels: Record<string, DateRange> =
      availableDateRanges.value.reduce(
        (arr: Record<string, DateRange>, { from, range }) => {
          arr[from] = range;
          return arr;
        },
        {},
      );
    if (value in knownLabels) {
      dateRange.value = [...(knownLabels[value] as DateRange)];
      searchParams.value.from = value;
    } else {
      const date = new Date(value);
      if (!value || (value && value.trim() === "") || Number.isNaN(date)) {
        let from = availableDateRanges.value.find(
          (v) => v.from === "3-days-ago",
        );
        if (!from) {
          from = availableDateRanges.value.find(
            (v) => v.from === "24-hours-ago",
          );
        }
        if (!from) {
          from = availableDateRanges.value.find((v) => v.from === "any");
        }
        if (from) {
          return { replacement: from.from }; // any time
        } else {
          console.error("Could not find from time for", value);
        }
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
        ({ id }) => id,
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
      console.log("Invalid timespan?", value);
    }
  } else if (key === "devices") {
    value = value || [];
    // Check that the location ids are valid.
    let ids: number[];
    if (Array.isArray(value)) {
      ids = value.map(Number);
    } else {
      ids = value.toString().split(",").map(Number);
    }
    searchParams.value.devices = ids;
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
  prev: LocationQuery | undefined,
) => {
  if (route.name !== "activity") {
    return;
  }

  if (prev === undefined) {
    prev = defaultSearchParams.value as LocationQuery;
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
  await loadActiveAndInactiveDevices();
  if (Object.entries(replacements).length) {
    const query: LocationQuery = {
      ...defaultSearchParams.value,
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
    if (query["display-mode"] === ActivitySearchDisplayMode.Visits) {
      delete query["tag-mode"];
      delete query["labelled-with"];
      delete query["no-false-positives"];
      delete query["include-descendant-tags"];
      delete query["recording-mode"];
    }
    await router.replace({
      query,
    });
  }
};
const router = useRouter();

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
    return locationHasAudioRecordings(location);
  } else if (searchParams.value.recordingMode === "cameras") {
    return locationHasCameraRecordings(location);
  }
  return (
    locationHasCameraRecordings(location) ||
    locationHasAudioRecordings(location)
  );
};

const validLocations = computed(() => {
  if (locations.value) {
    return (locations.value as ApiLocationResponse[]).filter(
      (location) =>
        locationHasRecordings(location) &&
        location.location &&
        (location.location.lat !== 0 || location.location.lng !== 0),
    );
  }
  return [];
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

const locationsForMap = computed<NamedPoint[]>(() => {
  return validLocations.value
    .filter(({ location }) =>
      projectIsAroundCacophonyHq.value ? true : !locIsInCacophonyHq(location),
    )
    .map(mapLocationForMap);
});
const highlightedPoint = computed<NamedPoint | null>(() => {
  return (
    (locationsForMap.value || []).find(
      (p) => p.id === currentlyHighlightedLocation.value,
    ) || null
  );
});

const selectedLocations = computed<(ApiLocationResponse | "any")[]>(() => {
  if (
    searchParams.value.locations.includes("any") ||
    searchParams.value.locations.length === 0
  ) {
    return ["any"];
  }
  return searchParams.value.locations
    .map((locId) =>
      locationsInSelectedTimespan.value.find(({ id }) => id === locId),
    )
    .filter((item) => !!item) as ApiLocationResponse[];
});

const selectedDevices = computed<ApiDeviceResponse[] | "all">(() => {
  if (searchParams.value.devices === "all") {
    return "all";
  }
  return (
    (searchParams.value.devices as DeviceId[]).map((deviceId) =>
      (devices.value || []).find(({ id }) => id === deviceId),
    ) as ApiDeviceResponse[]
  ).filter((device) => !!device);
});

const locationsInSelectedTimespan = computed<ApiLocationResponse[]>(() => {
  if (dateRange.value[0] === null || dateRange.value[1] === null) {
    return [];
  }
  if (locations.value) {
    const [fromDateTime, untilDateTime] = dateRange.value as [Date, Date];
    return (locations.value as ApiLocationResponse[]).filter((location) => {
      if (location.location.lat === 0 && location.location.lng === 0) {
        return false;
      }
      const latestDateForLocation = getLatestDateForLocationInRecordingMode(
        location,
        searchParams.value.recordingMode,
      );
      return (
        latestDateForLocation &&
        latestDateForLocation >= fromDateTime &&
        new Date(location.activeAt) <= untilDateTime
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
            ({ id }) => id === location.id,
          );
        }
      }
    })
    .filter(({ location }) =>
      projectIsAroundCacophonyHq.value ? true : !locIsInCacophonyHq(location),
    )
    .map(mapLocationForMap);
});

const minThermalDateForProject = computed<Date>(() => {
  // Earliest active location for thermal
  let earliest = new Date();
  if (locations.value) {
    for (const location of locations.value) {
      if (location.earliestThermalRecordingTime) {
        const activeAt = new Date(location.earliestThermalRecordingTime);
        if (activeAt < earliest) {
          earliest = activeAt;
        }
      }
    }
  }
  return earliest;
});

const minAudioDateForProject = computed<Date>(() => {
  // Earliest active location for audio
  let earliest = new Date();
  if (locations.value) {
    for (const location of locations.value) {
      if (location.earliestAudioRecordingTime) {
        const activeAt = new Date(location.earliestAudioRecordingTime);
        if (activeAt < earliest) {
          earliest = activeAt;
        }
      }
    }
  }
  return earliest;
});

const earliestThermalRecordingTimeForDevices = (
  devices: ApiDeviceResponse[],
): Date => {
  let earliest = new Date();
  for (const device of devices) {
    if (device.earliestThermalRecordingTime) {
      const activeAt = new Date(device.earliestThermalRecordingTime);
      if (activeAt < earliest) {
        earliest = activeAt;
      }
    }
  }
  return earliest;
};

const earliestAudioRecordingTimeForDevices = (
  devices: ApiDeviceResponse[],
): Date => {
  let earliest = new Date();
  for (const device of devices) {
    if (device.earliestAudioRecordingTime) {
      const activeAt = new Date(device.earliestAudioRecordingTime);
      if (activeAt < earliest) {
        earliest = activeAt;
      }
    }
  }
  return earliest;
};

const minDateForSelectedLocations = computed<Date>(() => {
  // Earliest active location
  if (
    (displayMode.value === ActivitySearchDisplayMode.Recordings &&
      recordingMode.value === ActivitySearchRecordingMode.Cameras) ||
    displayMode.value === ActivitySearchDisplayMode.Visits
  ) {
    // Return earliest thermal recording times
    if (selectedLocations.value.includes("any")) {
      if (
        selectedDevices.value.length !== 0 &&
        selectedDevices.value !== "all"
      ) {
        return earliestThermalRecordingTimeForDevices(
          selectedDevices.value as ApiDeviceResponse[],
        );
      }
      return new Date(minThermalDateForProject.value);
    }
    let earliest = new Date();
    if (selectedLocations.value) {
      for (const location of selectedLocations.value) {
        if (location !== "any" && location.earliestThermalRecordingTime) {
          const activeAt = new Date(location.earliestThermalRecordingTime);
          if (activeAt < earliest) {
            earliest = activeAt;
          }
        }
      }
    }
    return earliest;
  } else {
    // Earliest audio recording times.
    if (selectedLocations.value.includes("any")) {
      if (
        selectedDevices.value.length !== 0 &&
        selectedDevices.value !== "all"
      ) {
        return earliestAudioRecordingTimeForDevices(
          selectedDevices.value as ApiDeviceResponse[],
        );
      }
      return new Date(minAudioDateForProject.value);
    }
    let earliest = new Date();
    if (selectedLocations.value) {
      for (const location of selectedLocations.value) {
        if (location !== "any" && location.earliestAudioRecordingTime) {
          const activeAt = new Date(location.earliestAudioRecordingTime);
          if (activeAt < earliest) {
            earliest = activeAt;
          }
        }
      }
    }
    return earliest;
  }
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
          maxDate(lastThermalRecording, lastAudioRecording),
        ),
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
  locationsInSelectedTimespan,
);

interface MaybeDeletedRecording extends ApiRecordingResponse {
  tombstoned?: boolean;
}

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
  return filteredLoadedRecordings.value.length;
});
const canExpandSearchBackFurther = computed<boolean>(() => {
  return (
    currentQueryCursor.value.fromDateTime !== null &&
    Math.floor(currentQueryCursor.value.fromDateTime.getTime() / 1000) >
      Math.floor(minDateForSelectedLocations.value.getTime() / 1000)
  );
});
const updatedRecording = (
  recording: ApiRecordingResponse,
  recordingWasDeleted = false,
) => {
  const loadedRecording = loadedRecordings.value.find(
    ({ id }) => id === recording.id,
  );
  if (loadedRecording) {
    if (recordingWasDeleted) {
      (loadedRecording as MaybeDeletedRecording).tombstoned = true;
    } else {
      loadedRecording.tracks = recording.tracks;
      loadedRecording.tags = recording.tags;
    }
  }
};

const currentlySelectedVisit = ref<ApiStaticVisitResponse | null>(null);
// Chunk recordings into days and hours.
// Do we want to insert sunrise and sunset?  Probably.
const chunkedRecordings = ref<RecordingsChunk[]>([]);

const prefilteredChunkedVisits = ref<ApiStaticVisitResponse[]>([]);
const chunkedVisits = computed<ApiStaticVisitResponse[]>(() => {
  return prefilteredChunkedVisits.value.filter(
    (visit) => !visit.hasOwnProperty("tombstoned"),
  );
});
const filteredLoadedRecordings = computed<ApiRecordingResponse[]>(() => {
  return loadedRecordings.value.filter(
    (rec) => !rec.hasOwnProperty("tombstoned"),
  );
});

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
const currentQueryCount = ref<LoadedResource<number | undefined>>(null);
const currentQueryLoaded = ref<number>(0);
const completedCurrentQuery = ref<boolean>(false);

let needsObserverUpdate = false;
watch(filteredLoadedRecordings, (next, prev) => {
  if (next && prev && next.length !== prev.length) {
    needsObserverUpdate = true;
  }
});
watch(chunkedVisits, (next, prev) => {
  if (next && prev && next.length !== prev.length) {
    needsObserverUpdate = true;
  }
});

let currentObserver: { stop: () => void } | null;

onUpdated(() => {
  if (needsObserverUpdate) {
    let nearLast;
    if (inRecordingsMode.value) {
      nearLast = document.querySelector(
        ".day-container:last-child > .list-item:nth-last-child(3)",
      );
      if (!nearLast) {
        nearLast = document.querySelector(
          ".day-container:last-child > .list-item:nth-last-child(2)",
        );
      }
      if (!nearLast) {
        nearLast = document.querySelector(
          ".day-container:last-child > .list-item:last-child",
        );
      }
    } else if (inVisitsMode.value) {
      nearLast = document.querySelector(
        ".visits-daily-breakdown:nth-last-child(3)",
      );
      if (!nearLast) {
        nearLast = document.querySelector(
          ".visits-daily-breakdown:nth-last-child(2)",
        );
      }
      if (!nearLast) {
        nearLast = document.querySelector(".visits-daily-breakdown:last-child");
      }
    }
    if (nearLast) {
      // Check if it's already visible.
      const bounds = nearLast.getBoundingClientRect();
      if (bounds.top >= 0 && bounds.top <= windowHeight.value) {
        // FIXME - shouldn't do this automatically, (extend search)
        if (canExpandSearchBackFurther.value) {
          nextTick(() => doSearch());
        }
      } else {
        // Observe when this element comes into view.
        currentObserver = useIntersectionObserver(
          ref(nearLast as MaybeElement),
          (intersections: IntersectionObserverEntry[]) => {
            for (const intersection of intersections) {
              if (intersection.isIntersecting) {
                currentObserver && currentObserver.stop();
                currentObserver = null;
                doSearch();
                break;
              }
            }
          },
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
  //const fromDateTime = endOfDay(dateRange.value[0] as Date);
  return JSON.stringify({
    ...getCurrentQuery(),
    displayMode: displayMode.value,
    //fromDateTime,
    untilDateTime,
  });
};

interface RecordingQueryBase {
  types: (RecordingType.ThermalRaw | RecordingType.Audio)[];
  locations?: LocationId[];
  tagMode?: TagMode;
  tags?: string[];
  subClassTags?: boolean;
  includeFilteredFalsePositivesAndNones: boolean;
}
const getCurrentQuery = (): QueryRecordingsOptions => {
  const query: QueryRecordingsOptions = {
    types:
      searchParams.value.recordingMode === "cameras"
        ? [ConcreteRecordingType.ThermalRaw]
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
      (loc) => (loc as ApiLocationResponse).id,
    );
  }
  const isAllDevices = selectedDevices.value === "all";
  if (!isAllDevices) {
    query.devices = (selectedDevices.value as ApiDeviceResponse[]).map(
      (device) => (device as ApiDeviceResponse).id,
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

  // Hack in support for Megadetector "animal" into our hierarchy:
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
      (tag) => !animalChildren.includes(tag),
    );
    query.taggedWith = [...query.taggedWith, ...animalChildren];
  }

  return query;
};

const appendRecordingsChunkedByDay = (recordings: ApiRecordingResponse[]) => {
  const zone = timezoneForLatLng(canonicalLatLngForActiveLocations.value);
  for (const recording of recordings) {
    // Get the location local day:
    const recordingDate = new Date(recording.recordingDateTime);
    const dateTime = DateTime.fromJSDate(recordingDate, {
      zone,
    });

    const { sunrise, sunset } = sunCalc.getTimes(
      recordingDate,
      canonicalLatLngForActiveLocations.value.lat,
      canonicalLatLngForActiveLocations.value.lng,
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
    if (
      (recording.type === ConcreteRecordingType.ThermalRaw &&
        recording.duration < 2.5 &&
        recording.duration > 1.8) ||
      recording.status ||
      (recording.type === ConcreteRecordingType.Audio &&
        recording.duration < 11 &&
        recording.duration > 9.8) ||
      recording.status
    ) {
      let detail = "test recording";
      if (recording.status && recording.status !== "true") {
        detail = `${recording.status} recording`;
      }
      recording.tags.push({
        id: -1,
        confidence: 1,
        detail,
        createdAt: recording.recordingDateTime,
      });
    }
    if (recording.type === "audio" && recording.redacted) {
      recording.tags.push({
        id: -1,
        confidence: 1,
        detail: "redacted for privacy",
        createdAt: recording.recordingDateTime,
      });
    }
    prevDay.items.push({
      type: "recording",
      data: recording,
    });
  }
};

const appendVisitsChunkedByDay = (visits: ApiStaticVisitResponse[]) => {
  for (const visit of visits) {
    // TODO: May need to optimise this as the list gets long?
    prefilteredChunkedVisits.value.push(visit);
  }
};

const resetQuery = (
  newQueryHash: string,
  fromDateTime: Date,
  untilDateTime: Date,
) => {
  // NOTE: We want to maintain object identity for these arrays,
  // so we drain them rather than assigning a new empty array.
  while (loadedRecordings.value.length) {
    loadedRecordings.value.pop();
  }
  while (loadedRecordingIds.value.length) {
    loadedRecordingIds.value.pop();
  }
  while (chunkedRecordings.value.length) {
    chunkedRecordings.value.pop();
  }
  while (prefilteredChunkedVisits.value.length) {
    prefilteredChunkedVisits.value.pop();
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
  console.log(
    `Current query cursor ${(currentQueryCursor.value.fromDateTime as Date).toISOString()} -- ${(currentQueryCursor.value.untilDateTime as Date).toISOString()}`,
  );
};

const displayMode = computed<ActivitySearchDisplayMode>(
  () => searchParams.value.displayMode,
);
const recordingMode = computed<ActivitySearchRecordingMode>(
  () => searchParams.value.recordingMode,
);
const inRecordingsMode = computed<boolean>(
  () => displayMode.value === ActivitySearchDisplayMode.Recordings,
);
const inVisitsMode = computed<boolean>(
  () => displayMode.value === ActivitySearchDisplayMode.Visits,
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
    return [ConcreteRecordingType.ThermalRaw];
  } else {
    return [ConcreteRecordingType.Audio];
  }
});

const firstLoad = ref<boolean>(true);
const getRecordingsOrVisitsForCurrentQuery = async () => {
  // NOTE: We try to load at most one month at a time.
  let succeededWithoutAbort = true;
  if (currentProject.value) {
    const fromDateTime = dateRange.value[0];
    const untilDateTime = dateRange.value[1];
    if (fromDateTime === null && untilDateTime === null) {
      // Date range not yet defined
      return;
    }
    const queryHash = getCurrentQueryHash();
    const query = getCurrentQuery();
    const project = currentProject.value as SelectedProject;
    let isNewQuery;
    if (firstLoad.value) {
      firstLoad.value = false;
      isNewQuery = true;
    } else {
      isNewQuery = queryHash !== currentQueryHash.value;
    }
    const a = new Date(currentQueryCursor.value.fromDateTime as Date);
    const b = new Date(fromDateTime as Date);
    a.setMilliseconds(0);
    b.setMilliseconds(0);
    if (a < b) {
      // We need to narrow the already loaded search range
      isNewQuery = true;
    }
    //loadingQuery.value = queryHash;
    let earliestRecord = null;
    if (inRecordingsMode.value) {
      if (filteredLoadedRecordings.value.length) {
        earliestRecord = new Date(
          filteredLoadedRecordings.value[
            filteredLoadedRecordings.value.length - 1
          ].recordingDateTime,
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
        endOfDay(untilDateTime as Date),
      );
    }

    const aa = new Date(currentQueryCursor.value.fromDateTime as Date);
    const bb = new Date(fromDateTime as Date);
    aa.setMilliseconds(0);
    bb.setMilliseconds(0);
    const hasNotLoadedAllOfQueryTimeRange = aa > bb;

    // console.log("aa", aa.toISOString(), bb.toISOString());
    if (hasNotLoadedAllOfQueryTimeRange) {
      // console.log("Count all", queryMap[key].loaded === 0);
      // First time through, we want to count all for a given timespan query.
      const itemHeight = inRecordingsMode.value ? 80 : 160;
      const twoPagesWorth = Math.ceil(windowHeight.value / itemHeight) * 2;
      let response:
        | FetchResult<BulkRecordingsResponse>
        | LoadedResource<ApiStaticVisitResponse[]>;
      const maxVisitsPerRequest = 1000;
      if (inRecordingsMode.value) {
        // NOTE: Not sure we need to ever get the total count for this query for the
        //  purposes of this UI?
        CurrentViewAbortController.newView();
        response = await ClientApi.Recordings.queryRecordingsInProjectNew(
          project.id,
          {
            ...query,
            limit: twoPagesWorth,
            fromDateTime: dateRange.value[0],
            untilDateTime: currentQueryCursor.value.untilDateTime as Date,
            queryIsTimeSensitive: true,
            types: typesForRecordingMode.value as (
              | RecordingType.ThermalRaw
              | RecordingType.Audio
            )[],
          },
        );
        if (response && response.success && response.result.count) {
          currentQueryCount.value = response.result.count;
        }
      } else {
        // Else visits
        // Make it the lesser of the current date range or 2 pages worth of days.
        // We don't really know what 2 pages worth of days looks like in any given project though.
        // We could gauge it from the number of visits we get over time for the first request,
        // and adapt it dynamically?  Start small and ramp up?
        CurrentViewAbortController.newView();
        response = (await ClientApi.Visits.getVisitsForProject(
          project.id,
          dateRange.value[0] as Date,
          minDate(
            currentQueryCursor.value.untilDateTime as Date,
            endOfDay(maxDateForSelectedLocations.value),
          ),
          query.locations,
          maxVisitsPerRequest,
          true,
        )) as ApiStaticVisitResponse[];
      }
      if (
        response &&
        ((inRecordingsMode.value &&
          "success" in response &&
          response.success) ||
          inVisitsMode.value)
      ) {
        let loadedFewerItemsThanRequested;
        let gotUntilDate: Date | undefined;
        if (inRecordingsMode.value) {
          const recordingsResponse = response as unknown as SuccessFetchResult<{
            recordings: ApiRecordingResponse[];
          }>;
          const recordings = recordingsResponse.result.recordings;
          if (recordings && recordings.length) {
            const latest = new Date(recordings[0].recordingDateTime);
            const earliest = new Date(
              recordings[recordings.length - 1].recordingDateTime,
            );
            if (
              !loadedRecordings.value.length ||
              (loadedRecordings.value.length &&
                latest.getTime() > earliest.getTime())
            ) {
              // Don't append duplicate recordings
              loadedRecordings.value.push(...recordings);
              loadedFewerItemsThanRequested = recordings.length < twoPagesWorth;
              loadedRecordingIds.value.push(...recordings.map(({ id }) => id));
              appendRecordingsChunkedByDay(recordings);
              currentQueryLoaded.value += recordings.length;
              if (recordings.length !== 0) {
                const earliestTime =
                  recordings[recordings.length - 1].recordingDateTime;
                gotUntilDate = new Date(earliestTime);
              }
            } else {
              console.warn("Duplicate recordings, not appending");
            }
          }
        } else if (inVisitsMode.value) {
          const visits = response as ApiStaticVisitResponse[];
          loadedFewerItemsThanRequested = visits.length < maxVisitsPerRequest;
          if (visits.length !== 0) {
            // This is the earliest visit we have so far
            const earliestVisit = visits[visits.length - 1];
            gotUntilDate = new Date(earliestVisit.startTime);
            // NOTE: Append new visits.
            // Keep loading visits in the time-range selected until we fill up the page.
            appendVisitsChunkedByDay(visits);
          }
        }
        if (gotUntilDate) {
          // Increment the cursor.
          // NOTE: Not sure if this offsetting is necessary?
          gotUntilDate.setMilliseconds(gotUntilDate.getMilliseconds() - 1);
          currentQueryCursor.value.untilDateTime = gotUntilDate;
          const reachedMinDateForSelectedLocations =
            !!currentQueryCursor.value.fromDateTime &&
            (currentQueryCursor.value.fromDateTime as Date).getTime() ===
              minDateForSelectedLocations.value.getTime();
          /*console.log(
            "Loaded fewer than requested",
            reachedMinDateForSelectedLocations,
            minDateForSelectedLocations.value.toISOString(),
            "from",
            (currentQueryCursor.value.fromDateTime as Date).toISOString(),
            "until",
            (currentQueryCursor.value.untilDateTime as Date).toISOString(),
          );*/
          if (loadedFewerItemsThanRequested) {
            if (reachedMinDateForSelectedLocations || inVisitsMode.value) {
              console.log("Cancel observer");
              currentObserver && currentObserver.stop();
              currentObserver = null;
              // We're at the limit
            } else {
              // We're at the end of the current time range, but can expand it back further
              // and load more.
              currentQueryCursor.value.fromDateTime = new Date(
                currentQueryCursor.value.untilDateTime as Date,
              );
            }
          }
        } else {
          if (
            dateRange.value[0] &&
            dateRange.value[0].getTime() <=
              minDateForSelectedLocations.value.getTime()
          ) {
            currentQueryCursor.value.fromDateTime = new Date(
              minDateForSelectedLocations.value,
            );
          } else {
            currentQueryCursor.value.fromDateTime = new Date(
              currentQueryCursor.value.untilDateTime as Date,
            );
          }
          completedCurrentQuery.value = true;
        }
      } else {
        succeededWithoutAbort = false;
      }
    }
  }
  return succeededWithoutAbort;
};

const searching = ref<boolean>(false);
const exporting = ref<boolean>(false);
const exportProgress = ref<number>(0);
const exportStartTime = ref<number>(0);
const exportTime = ref<number>(0);
const exportProgressZeroOneHundred = computed<number>(
  () => exportProgress.value * 100,
);
const doSearch = async () => {
  searching.value = true;
  await getClassifications();
  await loadActiveAndInactiveDevices();
  const succeededWithoutAbort = await getRecordingsOrVisitsForCurrentQuery();
  if (succeededWithoutAbort) {
    searching.value = false;
  }
};

const download = (url: string, filename: string) => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  anchor.click();
};

const exportTimeElapsed = computed<number>(
  () => exportTime.value - exportStartTime.value,
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
      const visitsResponse = await ClientApi.Visits.getAllVisitsForProject(
        project.id,
        fromDateTime,
        untilDateTime,
        query.locations,
        7500,
        (progress) => {
          exportProgress.value = progress;
          exportTime.value = performance.now();
        },
      );
      const csvFileData = createVisitsCsv(visitsResponse, locations.value);
      download(
        URL.createObjectURL(
          new Blob([csvFileData], { type: "text/csv;charset=utf-8;" }),
        ),
        `${fileSafeProjectName.value}-visits-export.csv`,
      );
    } else if (inRecordingsMode.value) {
      query.fromDateTime = fromDateTime;
      query.untilDateTime = untilDateTime;
      const recordings =
        await ClientApi.Recordings.getAllRecordingsForProjectBetweenTimes(
          project.id,
          query,
          () => {
            exportTime.value = performance.now();
          },
        );
      const csvFileData = createRecordingsCsv(
        recordings,
        locations.value,
        searchParams.value.recordingMode === ActivitySearchRecordingMode.Audio,
      );
      download(
        URL.createObjectURL(
          new Blob([csvFileData], { type: "text/csv;charset=utf-8;" }),
        ),
        `${fileSafeProjectName.value}-recordings-export.csv`,
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
    new Date(setBackFourWeeks).getTime(),
  );
  return new Date(from);
});

const atMinimumTimeForSelectedLocations = computed<boolean>(() => {
  return (
    !!currentQueryCursor.value.fromDateTime &&
    Math.floor(minDateForSelectedLocations.value.getTime() / 1000) ===
      Math.floor(currentQueryCursor.value.fromDateTime.getTime() / 1000)
  );
});

const relativeTimeIncrementInPast = computed<string>(() => {
  if (
    fromDateMinusIncrement.value.getTime() ===
    minDateForSelectedLocations.value.getTime()
  ) {
    return "the earliest available date for this selection";
  }
  const oneYear = 1000 * 60 * 60 * 24 * 365;
  if (Date.now() - fromDateMinusIncrement.value.getTime() > oneYear) {
    return DateTime.fromJSDate(fromDateMinusIncrement.value).toRelative({
      unit: "months",
    }) as string;
  }
  return DateTime.fromJSDate(fromDateMinusIncrement.value).toRelative({
    round: true,
    padding: 1000 * 60 * 60 * 24 * 14, //
  }) as string;
});

const currentlySelectedRecording = computed<RecordingId | null>(
  () =>
    (route.params.currentRecordingId &&
      Number(route.params.currentRecordingId)) ||
    null,
);

// TODO: Load offset date from url params, and have the ability to also scroll upwards and load more,
//  as well as expand the search forwards in time.

const isCustomDateRange = computed<boolean>(
  () =>
    queryValueIsDate(searchParams.value.from) &&
    queryValueIsDate(searchParams.value.until),
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
    customAutomaticallySet.value = true;
  }
  dateRange.value = [fromDateMinusIncrement.value, dateRange.value[1]];
};

// FIXME: Handle recording closing etc, restoring route.
const selectedRecording = async (recordingId: RecordingId) => {
  await router.push({
    name: "activity-recording",
    params: {
      currentRecordingId: recordingId,
    },
    query: route.query,
  });
};

const selectedVisit = (visit: ApiStaticVisitResponse) => {
  currentlySelectedVisit.value = visit;
};

const prevLocationTimeSet = ref<number>(0);
const changedHighlightedLocation = (loc: LocationId | null) => {
  // Some simple debouncing for change of highlight location.
  if (currentlyHighlightedLocation.value && loc === null) {
    // Wait.
    setTimeout(() => {
      if (performance.now() - prevLocationTimeSet.value > 30) {
        // Don't set it.
        currentlyHighlightedLocation.value = null;
      }
    }, 10);
  } else {
    currentlyHighlightedLocation.value = loc;
    if (loc) {
      prevLocationTimeSet.value = performance.now();
    }
  }
};

watch(
  currentlySelectedVisit,
  (
    visit: ApiStaticVisitResponse | null,
    prevVisit: ApiStaticVisitResponse | null,
  ) => {
    if (visit && !prevVisit) {
      // This only happens when we select a visit from the visits list.
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
      let nextName = route.name;
      if (route.name === "activity") {
        // Set route so that modal shows up
        nextName = "activity-visit";
      }
      // If the deleted Id is at the end of the current visit, we want to go to the previous recording.
      // If the deleted id is

      router.push({
        name: nextName,
        params,
        query: route.query,
      });
    }
  },
);

const currentlyHighlightedLocation = ref<LocationId | null>(null);
const loadedRouteName = ref<string>("");

const closedModal = () => {
  currentlySelectedVisit.value = null;
};

const filteredLoadedRecordingIds = computed<RecordingId[]>(() => {
  return (filteredLoadedRecordings.value || []).map(({ id }) => id);
});

const projectHasLocationsWithRecordings = computed<boolean>(() => {
  return locationsForMap.value.length !== 0;
});

const mapWidthPx = computed<number>(() => {
  if (!mapBuffer.value) {
    return 0;
  }
  const mapBufferWidth = mapBuffer.value.offsetWidth;
  if (windowWidth.value >= 1920) {
    return mapBufferWidth + 128;
  }
  if (windowWidth.value >= 992) {
    return mapBufferWidth;
  }
  return 0;
});

const showOffcanvasSearch = ref<boolean>(false);
const toggleOffcanvasSearch = () => {
  showOffcanvasSearch.value = !showOffcanvasSearch.value;
};
const shouldShowSearchControlsInline = computed<boolean>(
  () => windowWidth.value >= 768,
);

const loadActiveAndInactiveDevices = async () => {
  if (!devices.value && currentProject.value) {
    devices.value = await ClientApi.Projects.getDevicesForProject(
      currentProject.value.id,
      true,
      true,
    );
  }
};

const recordingUpdated = async (
  recordingId: RecordingId,
  action: "deleted" | "updated",
  newClassification?: string,
  oldClassification?: string,
) => {
  console.log("Recording updated", recordingId, action);
  if (inVisitsMode.value) {
    let locations: LocationId[] = [];
    const isAnyLocation = selectedLocations.value.includes("any");
    if (!isAnyLocation) {
      locations = selectedLocations.value.map(
        (loc) => (loc as ApiLocationResponse).id,
      );
    }
    await recordingUpdatedInVisitsContext(
      recordingId,
      action,
      newClassification,
      oldClassification,
      currentlySelectedVisit,
      prefilteredChunkedVisits,
      route,
      (currentProject.value as SelectedProject).id,
      locations,
    );
  }
};

onBeforeMount(async () => {
  loading.value = true;
  if (currentProject.value) {
    await Promise.all([
      projectLocationsLoaded(),
      loadActiveAndInactiveDevices(),
    ]);
    await loadActiveAndInactiveDevices();
    // Validate the current query on load.
    watchQuery.value = watch(() => route.query, syncSearchQuery, {
      deep: true,
      immediate: true,
    });
  }
  loading.value = false;
});

onBeforeUnmount(() => {
  watchQuery.value && watchQuery.value();
});

provide(activeLocations, locationsInSelectedTimespan);
provide(latLngForActiveLocations, canonicalLatLngForActiveLocations);
provide("loadedRecordingIds", filteredLoadedRecordingIds);
provide("loadedRecordings", loadedRecordings);
provide("currentRecordingCount", currentTotalRecordings);
provide("canLoadMoreRecordingsInPast", canLoadMoreRecordingsInPast);
provide("updatedRecording", updatedRecording);
provide("requestLoadMoreRecordingsInPast", () => loadMoreRecordingsInPast());
provide("currentlySelectedVisit", currentlySelectedVisit);
provide("visitsContext", chunkedVisits);
// TODO: Nice to have - allow expanding the current search range when we reach the end of the list of recordings.
provide("canExpandCurrentQueryInPast", canExpandSearchBackFurther);
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
    class="d-flex justify-content-center align-items-center flex-fill"
  >
    <b-spinner variant="secondary" />
  </div>
  <div
    v-else-if="!projectHasLocationsWithRecordings"
    class="flex-grow-1 d-flex align-items-center justify-content-center"
  >
    <div
      class="no-results text-body-tertiary d-flex flex-column text-center col col-12 col-md-8 col-lg-6"
    >
      <material-symbol
        name="troubleshoot"
        size="2.4rem"
        grade="thin"
        class="mb-3"
      />
      <h4 class="h5 mb-2">This project has no activity yet</h4>
      <p v-if="!projectHasDevices">
        This project is likely new or doesn't have any devices associated with
        it yet. <br class="d-none d-sm-inline" />
        Use the Sidekick mobile app to add devices to your project.
      </p>

      <p v-else-if="!projectHasInternetConnectedDevices">
        The devices of this project may not be connected to the internet.
        <br class="d-none d-sm-inline" />
        Use the Sidekick mobile app to offload recordings from devices without
        connectivity, and sync them later when you have an internet connection
        on your phone.
      </p>
      <p v-else>
        It looks like none of your devices have uploaded any recordings yet.
      </p>
    </div>
  </div>
  <div
    v-else
    class="d-flex flex-md-row flex-column-reverse flex-fill row search-container"
    ref="searchContainer"
  >
    <nav
      class="search-controls-wrapper col col-12 col-md-4 col-lg-3 col-xl-3 col-xxl-3 d-flex py-md-0 align-items-md-start"
      ref="searchControls"
    >
      <div class="search-results-toggle position-fixed d-md-none d-block">
        <b-button
          @click="toggleOffcanvasSearch"
          class="d-flex align-items-center p-2"
        >
          <material-symbol
            :name="'search_gear' as unknown as IconsProp"
            size="1.5rem"
          />
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
      <div class="search-controls-scroll w-100 h-100 pb-3 me-xxl-3">
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
      </div>
    </nav>
    <div
      class="search-results col col-12 col-md-8 col-lg-6 col-xl-6 col-xxl-6 flex-grow-1 d-flex justify-content-center pb-3"
      ref="searchResults"
    >
      <div class="search-results-inner d-flex flex-grow-1 flex-column w-100">
        <activity-search-description
          :locations-in-selected-timespan="locationsInSelectedTimespan"
          :selected-locations="selectedLocations"
          :selected-devices="selectedDevices"
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
            :devices="devices || []"
          />
          <visits-breakdown-list
            v-else-if="inVisitsMode"
            :visits="chunkedVisits"
            :location="canonicalLatLngForActiveLocations"
            :highlighted-location="currentlyHighlightedLocation"
            @selected-visit="selectedVisit"
            @change-highlighted-location="changedHighlightedLocation"
            class="mt-2"
          />
        </div>
        <div
          v-if="searching"
          class="d-flex justify-content-center flex-columns align-items-center flex-fill"
        >
          <b-spinner variant="secondary" />
        </div>
        <div v-else-if="completedCurrentQuery && canExpandSearchBackFurther">
          <div class="no-results text-body-tertiary text-center py-3">
            <!--            <material-symbol
              name="search_off"
              size="2.4rem"
              grade="thin"
              class="mb-2"
            />-->
            <p>
              No additional results found for the selected time range. <br />
              Try expanding the search start back to
              {{ relativeTimeIncrementInPast }}.
            </p>
            <button
              @click="adjustTimespanBackwards"
              type="button"
              class="btn btn-outline-secondary"
            >
              Expand search
            </button>
          </div>
        </div>
        <div
          v-else-if="atMinimumTimeForSelectedLocations"
          data-cy="no results"
          class="flex-grow-1 d-flex align-items-center justify-content-center"
        >
          <div
            class="no-results text-body-tertiary text-center d-flex flex-column"
          >
            <material-symbol
              name="search_off"
              size="2.4rem"
              grade="thin"
              class="mb-2"
            />
            <span
              v-if="
                (searchParams.displayMode ===
                  ActivitySearchDisplayMode.Recordings &&
                  !filteredLoadedRecordings.length) ||
                (searchParams.displayMode ===
                  ActivitySearchDisplayMode.Visits &&
                  !chunkedVisits.length)
              "
              >No results for the current search.</span
            >
            <span v-else
              >No results for the selected locations before this time.</span
            >
          </div>
        </div>
        <div
          v-else-if="
            (searchParams.displayMode ===
              ActivitySearchDisplayMode.Recordings &&
              filteredLoadedRecordings.length) ||
            (searchParams.displayMode === ActivitySearchDisplayMode.Visits &&
              chunkedVisits.length)
          "
          data-cy="no results"
          class="flex-grow-1 d-flex align-items-center justify-content-center"
        >
          <div
            class="no-results text-body-tertiary text-center d-flex flex-column"
          >
            <material-symbol
              name="search_off"
              size="2.4rem"
              grade="thin"
              class="mb-2"
            />
            No results before this time for the current search.
          </div>
        </div>
        <div
          v-else
          data-cy="no results"
          class="flex-grow-1 d-flex align-items-center justify-content-center"
        >
          <div
            class="no-results text-body-tertiary text-center d-flex flex-column"
          >
            <material-symbol
              name="search_off"
              size="2.4rem"
              grade="thin"
              class="mb-2"
            />
            No results for the current search.
          </div>
        </div>
      </div>
    </div>
    <div
      class="map-buffer d-none d-lg-flex col col-lg-3 col-xl-3 col-xxl-3"
      ref="mapBuffer"
    ></div>
  </div>
  <map-with-points
    ref="mapContainer"
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
    @recording-updated="recordingUpdated"
    @close="closedModal"
  />
  <b-modal
    v-model="exporting"
    centered
    no-close-on-esc
    title="Exporting data"
    @hidden="() => (exportProgress = 0)"
    no-close-on-backdrop
    no-footer
    hide-header-close
  >
    <activity-search-description
      :locations-in-selected-timespan="locationsInSelectedTimespan"
      :selected-locations="selectedLocations"
      :selected-devices="selectedDevices"
      :available-date-ranges="availableDateRanges"
      :search-params="searchParams"
    />
    <div v-if="inVisitsMode">
      <b-progress :value="exportProgressZeroOneHundred" />
      <p class="mt-1 mb-0">
        {{ Math.max(0, exportTimeElapsed / 1000).toFixed(1) }} seconds elapsed
      </p>
    </div>
    <div class="d-flex align-content-center align-items-center" v-else>
      <b-spinner variant="secondary" small class="me-2" />
      <span
        >{{ Math.max(0, exportTimeElapsed / 1000).toFixed(1) }} seconds
        elapsed</span
      >
    </div>
  </b-modal>
</template>
<style lang="less" scoped>
@import "../assets/less/breakpoints";
.search-results-toggle {
  top: calc(var(--cp-grid-base) * 36); //144px
  right: 0;
  z-index: 1019;
  > .btn {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
}
.map {
  @media screen and (min-width: 768px) {
    position: absolute !important;
    right: 0;
    top: 0;
    height: 100svh !important;
  }
}
.no-results {
  @media (max-width: @breakpoint-xs-max) {
    font-size: var(--cp-font-size-sm);
  }
}
</style>
<style lang="less">
.search-controls-wrapper {
  .search-controls-scroll {
    max-height: 100cqh;
    overflow-y: auto;
    position: sticky;
    top: var(--cp-spacing-md);
    overflow-x: hidden;
    // add inner padding and then compensate for it so the focus style of the switch doesn't get truncated
    padding-left: 4px;
    padding-right: 4px;
    margin-left: -4px;
    margin-right: -4px;
  }
  .search-controls {
    max-width: calc(var(--cp-grid-base) * 64); //256px
  }
  .b-overlay-wrap .b-overlay {
    z-index: 1040 !important;
  }
}
</style>

<script setup lang="ts">
import Datepicker from "@vuepic/vue-datepicker";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import Multiselect from "@vueform/multiselect";
import {
  computed,
  type ComputedRef,
  inject,
  nextTick,
  onBeforeMount,
  onBeforeUnmount,
  ref,
  type Ref,
  watch,
  type WatchStopHandle,
} from "vue";
import {
  currentSelectedProject as currentActiveProject,
  userProjects,
} from "@models/provides.ts";
import type { SelectedProject } from "@models/LoggedInUser.ts";
import type { LoadedResource } from "@api/types.ts";
import type { ApiGroupResponse as ApiProjectResponse } from "@typedefs/api/group";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { timezoneForLatLng } from "@models/visitsUtils.ts";
import { canonicalLatLngForLocations } from "@/helpers/Location.ts";
import { TagMode } from "@typedefs/api/consts.ts";
import {
  ActivitySearchDisplayMode,
  ActivitySearchRecordingMode,
  getLatestDateForLocationInRecordingMode,
  queryValueIsDate,
} from "@/components/activitySearchUtils.ts";
import type { ActivitySearchParams } from "@views/ActivitySearchView.vue";
import { type LocationQuery, useRoute, useRouter } from "vue-router";
import { useElementBounding } from "@vueuse/core";
import { urlNormaliseName } from "@/utils.ts";
import {
  CurrentProjectAudioLabels,
  CurrentProjectCameraLabels,
} from "@/helpers/Project.ts";

const props = defineProps<{
  locations: Ref<LoadedResource<ApiLocationResponse[]>>;
  params: ActivitySearchParams;
  searching: boolean;
  customSet: boolean;
}>();

const emit = defineEmits([
  "search-requested",
  "export-requested",
  "accepted-custom-set",
]);

const tagInfoParent = ref<HTMLSpanElement>();
const falsePositiveInfoParent = ref<HTMLSpanElement>();
const toggleSubspeciesHelp = ref<boolean>(false);
const toggleFalsePositiveFilterHelp = ref<boolean>(false);

const selectedLocations = ref<(ApiLocationResponse | "any")[]>(["any"]);
const currentProject = inject(currentActiveProject) as ComputedRef<
  SelectedProject | false
>;
const availableProjects = inject(userProjects) as Ref<
  LoadedResource<ApiProjectResponse[]>
>;

const availableLabels = computed(() => {
  let labelSource;
  if (recordingMode.value === ActivitySearchRecordingMode.Cameras) {
    labelSource = CurrentProjectCameraLabels.value;
  } else {
    labelSource = CurrentProjectAudioLabels.value;
  }
  const labels = labelSource.slice(2).map(({ text, value }) => ({
    label: text,
    value: (value || text).toLowerCase(),
  }));
  if (selectedCoolLabel.value) {
    const label = labelSource[0];
    labels.push({
      label: label.text,
      value: (label.value || label.text).toLowerCase(),
    });
  }
  if (selectedFlaggedLabel.value) {
    const label = labelSource[1];
    labels.push({
      label: label.text,
      value: (label.value || label.text).toLowerCase(),
    });
  }
  return labels;
});

const projectHasAudio = computed<boolean>(() => {
  if (currentProject.value !== false) {
    return !!(currentProject.value as SelectedProject).lastAudioRecordingTime;
  }
  return false;
});

const projectHasCameras = computed<boolean>(() => {
  if (currentProject.value !== false) {
    return !!(currentProject.value as SelectedProject).lastThermalRecordingTime;
  }
  return false;
});

const projectHasAudioAndThermal = computed<boolean>(() => {
  return projectHasAudio.value && projectHasCameras.value;
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
const dateRangePicker = ref<typeof Datepicker>();

// Initialise this to a zero range
interface DateRangeOption {
  label: string;
  value: [Date, Date] | "custom";
  urlLabel: string;
}

const selectedDateRange = ref<DateRangeOption>({
  value: [now, now],
  label: "Now",
  urlLabel: "now",
});
const customDateRange = ref<[Date, Date] | null>(null);
const combinedDateRange = computed<[Date, Date]>(() => {
  if (selectedDateRange.value.value === "custom") {
    if (customDateRange.value !== null) {
      // FIXME: Timezones for project when you're viewing from outside the projects timezone
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
    return selectedDateRange.value.value as [Date, Date];
  }
});

const minDateForProject = computed<Date>(() => {
  // Earliest active location
  let earliest = new Date();
  if (props.locations.value) {
    for (const location of props.locations.value) {
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
    return minDateForProject.value;
  }
  let earliest = new Date();
  if (selectedLocations.value) {
    for (const location of selectedLocations.value as ApiLocationResponse[]) {
      const activeAt = new Date(location.activeAt);
      if (activeAt < earliest) {
        earliest = activeAt;
      }
    }
  }
  return earliest;
});

const searchIsValid = computed<boolean>(() => {
  const hasValidDateRange =
    Array.isArray(selectedDateRange.value) ||
    (selectedDateRange.value.value &&
      Array.isArray(selectedDateRange.value.value)) ||
    Array.isArray(customDateRange.value);
  const hasAdvancedSettingsSelected =
    showAdvanced.value &&
    props.params.displayMode === ActivitySearchDisplayMode.Recordings;
  if (!hasAdvancedSettingsSelected) {
    return hasValidDateRange && selectedLocations.value.length !== 0;
  } else {
    if (tagMode.value === TagMode.Tagged) {
      return selectedTags.value.length !== 0;
    }
    return true;
  }
});

interface DatePickerMethods {
  openMenu: () => void;
}

const showAdvanced = ref<boolean>(false);

onBeforeMount(() => {
  showAdvanced.value = hasAdvancedFiltersSet.value;
});

const maxDateForProject = computed<Date>(() => {
  // Latest active location
  let latest = new Date();
  latest.setFullYear(2010);
  if (props.locations.value) {
    for (const location of props.locations.value) {
      const latestDateForLocation = getLatestDateForLocationInRecordingMode(
        location,
        props.params.recordingMode,
      );
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
    for (const location of selectedLocations.value as ApiLocationResponse[]) {
      const latestDateForLocation = getLatestDateForLocationInRecordingMode(
        location,
        props.params.recordingMode,
      );
      if (latestDateForLocation && latestDateForLocation > latest) {
        latest = latestDateForLocation;
      }
    }
  }
  return latest;
});

const maybeSelectDatePicker = (value: {
  label: string;
  value: [Date, Date] | string;
  urlLabel: string;
}) => {
  if (value.value === "custom" && !props.customSet) {
    nextTick(() => {
      if (dateRangePicker.value) {
        dateRangePicker.value.openMenu();
      }
    });
  } else if (props.customSet) {
    emit("accepted-custom-set");
  }
};
const onChangeLocationsSelect = (
  value: (ApiLocationResponse | "any")[],
  _select: MultiSelectEl,
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

const timezoneForProject = computed<string>(() => {
  return timezoneForLatLng(canonicalLatLngForActiveLocations.value);
});

const maxDateForProjectMinusTwoWeeks = computed<Date>(() => {
  const max = new Date(maxDateForProject.value);
  max.setDate(max.getDate() - 14);
  return new Date(max);
});

watch(
  () => props.params.recordingMode,
  () => {
    // If the selected date range no longer applies to the current mode, reset it.
    if (
      combinedDateRange.value[0] < minDateForProject.value ||
      combinedDateRange.value[1] > maxDateForProject.value
    ) {
      console.warn("Should adjust range");
      selectedDateRange.value = commonDateRanges.value[0];
      customDateRange.value = null;
    }
  },
);

const commonDateRanges = computed<
  { value: [Date, Date] | "custom"; label: string; urlLabel: string }[]
>(() => {
  const earliest = minDateForProject.value;
  const latest = maxDateForProject.value;
  const ranges = [];
  if (earliest < oneDayAgo && latest > oneDayAgo) {
    ranges.push({
      label: "Last 24 hours",
      urlLabel: "24-hours-ago",
      value: lastTwentyFourHours,
    });
  }
  if (earliest < threeDaysAgo && latest > threeDaysAgo) {
    ranges.push({
      label: "Last 3 days",
      urlLabel: "3-days-ago",
      value: [threeDaysAgo, now],
    });
  }
  if (earliest < oneWeekAgo && latest > oneWeekAgo) {
    ranges.push({
      label: "Last week",
      urlLabel: "1-week-ago",
      value: [oneWeekAgo, now],
    });
  }
  if (earliest < oneMonthAgo && latest > oneMonthAgo) {
    ranges.push({
      label: "Last month",
      urlLabel: "1-month-ago",
      value: [oneMonthAgo, now],
    });
  }
  if (earliest < threeMonthsAgo && latest > threeMonthsAgo) {
    ranges.push({
      label: "Last 3 months",
      urlLabel: "3-months-ago",
      value: [threeMonthsAgo, now],
    });
  }
  if (earliest < oneYearAgo && latest > oneYearAgo) {
    ranges.push({
      label: "Last year",
      urlLabel: "1-year-ago",
      value: [oneYearAgo, now],
    });
  }
  ranges.push(
    {
      label: "Any time",
      urlLabel: "any",
      value: [earliest, now],
    },
    {
      label: "Custom date range",
      value: "custom",
      urlLabel: "",
    },
  );
  return ranges as {
    value: [Date, Date] | "custom";
    label: string;
    urlLabel: string;
  }[];
});
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

const includeSubSpeciesTags = ref<boolean>(true);
const selectedTags = ref<string[]>([]);
const selectedLabels = ref<string[]>([]);
const starredLabel = ref<boolean>(false);
const flaggedLabel = ref<boolean>(false);
const showFilteredFalsePositivesAndNones = ref<boolean>(false);
const showUntaggedOnly = ref<boolean>(false);
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
const locationsInSelectedTimespan = computed<ApiLocationResponse[]>(() => {
  if (props.locations.value) {
    return (props.locations.value as ApiLocationResponse[]).filter(
      (location) => {
        if (location.location.lat === 0 && location.location.lng === 0) {
          return false;
        }
        const latestDateForLocation = getLatestDateForLocationInRecordingMode(
          location,
          props.params.recordingMode,
        );
        return (
          latestDateForLocation &&
          latestDateForLocation >= combinedDateRange.value[0] &&
          new Date(location.activeAt) <= combinedDateRange.value[1]
        );
      },
    );
  }
  return [];
});

const locationsInSelectedTimespanOptions = computed<
  { value: ApiLocationResponse | "any"; label: string }[]
>(() => {
  return [
    { value: "any", label: "All locations", disabled: true },
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
const canonicalLatLngForActiveLocations = canonicalLatLngForLocations(
  locationsInSelectedTimespan,
);
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
                (option.value as ApiLocationResponse).id === item.id,
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

const recordingMode = ref<ActivitySearchRecordingMode>(
  ActivitySearchRecordingMode.Cameras,
);
const displayMode = ref<ActivitySearchDisplayMode>(
  ActivitySearchDisplayMode.Visits,
);

const computedDisplayMode = computed<ActivitySearchDisplayMode>({
  get: () => {
    if (recordingMode.value === ActivitySearchRecordingMode.Cameras) {
      return displayMode.value;
    } else {
      return ActivitySearchDisplayMode.Recordings;
    }
  },
  set: (val: ActivitySearchDisplayMode) => {
    if (recordingMode.value === ActivitySearchRecordingMode.Cameras) {
      displayMode.value = val;
    } else {
      // Don't set
    }
  },
});
const tagMode = ref<TagMode>(TagMode.Any);
const router = useRouter();
const route = useRoute();
const getCurrentQuery = (): LocationQuery => {
  const locationsHasAny =
    selectedLocations.value.indexOf("any") !== -1 &&
    selectedLocations.value.length === 1;
  const selectedLocationsValue = locationsHasAny
    ? "any"
    : (
        selectedLocations.value.filter(
          (item) => item !== "any",
        ) as ApiLocationResponse[]
      )
        .map(({ id }) => id)
        .join(",");
  const query: LocationQuery = {
    ...route.query,
    "display-mode": displayMode.value,
    "recording-mode": recordingMode.value,
    locations: selectedLocationsValue,
    "tag-mode": tagMode.value,
    "include-descendant-tags": includeSubSpeciesTags.value.toString(),
    "no-false-positives":
      (!showFilteredFalsePositivesAndNones.value).toString(),
  };
  if (tagMode.value === TagMode.Tagged && !selectedTags.value.includes("any")) {
    query["tagged-with"] = selectedTags.value.join(",");
  } else {
    if (tagMode.value === TagMode.Tagged) {
      tagMode.value = TagMode.Any;
      query["tag-mode"] = tagMode.value;
    }
    delete query["tagged-with"];
  }
  if (selectedLabels.value.length || starredLabel.value || flaggedLabel.value) {
    const labels = [...selectedLabels.value];
    if (starredLabel.value) {
      labels.push(COOL);
    }
    if (flaggedLabel.value) {
      labels.push(FLAG);
    }
    query["labelled-with"] = labels.join(",");
  } else {
    delete query["labelled-with"];
  }
  if (query["recording-mode"] === ActivitySearchRecordingMode.Audio) {
    query["display-mode"] = ActivitySearchDisplayMode.Recordings;
  }
  if (query["display-mode"] === "visits") {
    delete query["tag-mode"];
    delete query["labelled-with"];
    delete query["no-false-positives"];
    delete query["include-descendant-tags"];
    delete query["recording-mode"];
  }
  return query;
};
const updateDateRouteComponent = async (
  next: [Date, Date],
  prev: [Date, Date] | undefined,
) => {
  const isDates =
    Array.isArray(next) &&
    Array.isArray(prev) &&
    (next as unknown[]).length !== 0 &&
    (next as unknown[]).every((item: unknown) => item instanceof Date);
  const fromChanged =
    isDates &&
    (next[0] as Date).toISOString() !== (prev[0] as Date).toISOString();
  const untilChanged =
    isDates &&
    (next[1] as Date).toISOString() !== (prev[1] as Date).toISOString();
  const datesChanged = isDates && (fromChanged || untilChanged);
  if (datesChanged) {
    const query = getCurrentQuery();
    const commonDateRange = commonDateRanges.value.find(
      ({ value }) =>
        value[0] === combinedDateRange.value[0] &&
        value[1] === combinedDateRange.value[1],
    );
    if (commonDateRange) {
      query.from = commonDateRange.urlLabel;
      if ("until" in query) {
        delete query.until;
      }
    } else {
      query.from = startOfDay(combinedDateRange.value[0]).toISOString();
      query.until = endOfDay(combinedDateRange.value[1]).toISOString();
    }
    await router.replace({
      query,
    });
  }
};

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

const updateRoute = async (
  next: string | boolean,
  prev: string | boolean | undefined,
) => {
  if (prev !== next) {
    // TODO: Emit event to clear current search results (or really, just handle the route change in the parent)
    const query = getCurrentQuery();
    await router.replace({
      query,
    });
  }
};

const arrayContentsAreTheSame = (
  a: (number | string)[],
  b: (number | string)[],
): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (const aItem of a) {
    if (!b.includes(aItem)) {
      return false;
    }
  }
  return true;
};

const updateTagsRoute = async (next: string[], prev: string[] | undefined) => {
  if (!arrayContentsAreTheSame(prev || [], next)) {
    const query = getCurrentQuery();
    await router.replace({
      query,
    });
  }
};

const updateLabelsRoute = async (
  next: string[],
  prev: string[] | undefined,
) => {
  console.log("update labels", next, prev);
  if (!arrayContentsAreTheSame(prev || [], next)) {
    const query = getCurrentQuery();
    console.log("replacing query", query);
    await router.replace({
      query,
    });
  }
};

const updateLocationsRoute = async (
  next: (ApiLocationResponse | "any")[],
  prev: (ApiLocationResponse | "any")[] | undefined,
) => {
  const flattenLocations = (
    a: (ApiLocationResponse | "any")[],
  ): (number | string)[] => {
    return a.map((item: ApiLocationResponse | "any") => {
      if (item === "any") {
        return item;
      }
      return item.id;
    });
  };
  const locationArrayContentsAreTheSame = (
    a: (ApiLocationResponse | "any")[],
    b: (ApiLocationResponse | "any")[],
  ): boolean =>
    arrayContentsAreTheSame(flattenLocations(a), flattenLocations(b));
  if (!locationArrayContentsAreTheSame(prev || [], next)) {
    const query = getCurrentQuery();
    await router.replace({
      query,
    });
  }
};
const syncParams = (
  next: ActivitySearchParams,
  _prev: ActivitySearchParams | undefined,
) => {
  // Set our local state variables from the state change from our parent
  displayMode.value = next.displayMode;
  recordingMode.value = next.recordingMode;
  tagMode.value = next.tagMode;
  if (tagMode.value === TagMode.Tagged) {
    selectedTags.value = next.taggedWith;
  } else {
    selectedTags.value = [];
  }
  showUntaggedOnly.value = tagMode.value === TagMode.UnTagged;
  if (next.labelledWith && next.labelledWith.length) {
    starredLabel.value = next.labelledWith.includes(COOL);
    flaggedLabel.value = next.labelledWith.includes(FLAG);
    selectedLabels.value = next.labelledWith.filter(
      (label) => label !== COOL && label !== FLAG,
    );
  }
  showFilteredFalsePositivesAndNones.value = next.includeFalsePositives;
  if (Array.isArray(next.locations) && next.locations.length) {
    if (next.locations[0] === "any") {
      selectedLocations.value = ["any"];
    } else {
      selectedLocations.value = next.locations
        .map((id) =>
          (props.locations.value || []).find((item) => item.id === id),
        )
        .filter((x) => x !== undefined) as ApiLocationResponse[];
    }
  }
  let foundRange;
  if (next.from) {
    foundRange = commonDateRanges.value.find(
      ({ urlLabel }) => next.from === urlLabel,
    );
  }
  if (foundRange) {
    selectedDateRange.value = foundRange;
  } else if (next.from && !next.until) {
    // Try to match to the common date ranges and pick an option.
    selectedDateRange.value = commonDateRanges.value[0];
    updateDateRouteComponent(combinedDateRange.value, [now, now]);
  } else if (next.from && next.until) {
    selectedDateRange.value =
      commonDateRanges.value[commonDateRanges.value.length - 1];
    // Validate the custom range being passed, constrain it to the min/max
    const areValidDates =
      queryValueIsDate(next.from) && queryValueIsDate(next.until);
    if (areValidDates) {
      const from = new Date(next.from).getTime();
      const until = new Date(next.until).getTime();
      const min = minDateForProject.value.getTime();
      const max = endOfDay(new Date()).getTime(); //maxDateForProject.value.getTime();
      const constrainedFrom = Math.min(Math.max(from, min), max);
      const constrainedUntil = Math.min(Math.max(until, min), max);
      const constrainedRange =
        from !== constrainedFrom || until !== constrainedUntil;
      const fromDate = new Date(constrainedFrom);
      const untilDate = new Date(constrainedUntil);
      if (!customDateRange.value) {
        customDateRange.value = [fromDate, untilDate];
      } else {
        customDateRange.value[0] = fromDate;
        customDateRange.value[1] = untilDate;
      }
      if (constrainedRange) {
        updateDateRouteComponent(combinedDateRange.value, [now, now]);
      }
    } else {
      selectedDateRange.value = commonDateRanges.value[0];
    }
  }
};

const watchRecordingMode = ref<WatchStopHandle | null>(null);
const watchDisplayMode = ref<WatchStopHandle | null>(null);
const watchCombinedDateRange = ref<WatchStopHandle | null>(null);
const watchSelectedLocations = ref<WatchStopHandle | null>(null);
const watchTagMode = ref<WatchStopHandle | null>(null);
const watchProps = ref<WatchStopHandle | null>(null);
const watchUntaggedOnly = ref<WatchStopHandle | null>(null);
const watchSelectedTags = ref<WatchStopHandle | null>(null);
const watchFilterFalsePositivesAndNones = ref<WatchStopHandle | null>(null);
const watchStarred = ref<WatchStopHandle | null>(null);
const watchFlagged = ref<WatchStopHandle | null>(null);
const watchSelectedLabels = ref<WatchStopHandle | null>(null);
const watchSubClassToggle = ref<WatchStopHandle | null>(null);

const hasAdvancedFiltersSet = computed<boolean>(() => {
  return (
    tagMode.value !== TagMode.Any ||
    selectedLabels.value.length !== 0 ||
    starredLabel.value ||
    flaggedLabel.value
  );
});

onBeforeMount(() => {
  watchProps.value = watch(props.params, syncParams, {
    deep: true,
    immediate: false,
  });
  if (
    currentProject.value &&
    urlNormaliseName(currentProject.value.groupName) ===
      route.params.projectName
  ) {
    syncParams(props.params, undefined);
  }

  watchRecordingMode.value = watch(recordingMode, updateRoute);
  watchDisplayMode.value = watch(displayMode, updateRoute);
  watchCombinedDateRange.value = watch(
    combinedDateRange,
    updateDateRouteComponent,
  );
  watchSelectedLocations.value = watch(selectedLocations, updateLocationsRoute);
  watchUntaggedOnly.value = watch(showUntaggedOnly, (next: boolean) => {
    if (next) {
      selectedTags.value = [];
    } else {
      if (selectedTags.value.length) {
        tagMode.value = TagMode.Tagged;
      } else {
        tagMode.value = TagMode.Any;
      }
    }
  });
  watchSelectedTags.value = watch(
    selectedTags,
    (next: string[], prev: string[]) => {
      if (!next.length) {
        if (showUntaggedOnly.value) {
          tagMode.value = TagMode.UnTagged;
        } else {
          tagMode.value = TagMode.Any;
        }
      } else {
        if (showUntaggedOnly.value) {
          tagMode.value = TagMode.UnTagged;
        } else {
          tagMode.value = TagMode.Tagged;
        }
      }
      updateTagsRoute(next, prev);
    },
  );
  watchSubClassToggle.value = watch(includeSubSpeciesTags, updateRoute);
  watchTagMode.value = watch(tagMode, updateRoute);
  watchFilterFalsePositivesAndNones.value = watch(
    showFilteredFalsePositivesAndNones,
    updateRoute,
  );
  watchStarred.value = watch(starredLabel, updateRoute);
  watchFlagged.value = watch(flaggedLabel, updateRoute);
  watchSelectedLabels.value = watch(selectedLabels, updateLabelsRoute);
  showAdvanced.value = hasAdvancedFiltersSet.value;
  emit("search-requested");
});
onBeforeUnmount(() => {
  watchProps.value && watchProps.value();
  watchDisplayMode.value && watchDisplayMode.value();
  watchRecordingMode.value && watchRecordingMode.value();
  watchCombinedDateRange.value && watchCombinedDateRange.value();
  watchSelectedLocations.value && watchSelectedLocations.value();
  watchUntaggedOnly.value && watchUntaggedOnly.value();
  watchSelectedTags.value && watchSelectedTags.value();
  watchTagMode.value && watchTagMode.value();
  watchFilterFalsePositivesAndNones.value &&
    watchFilterFalsePositivesAndNones.value();
  watchStarred.value && watchStarred.value();
  watchFlagged.value && watchFlagged.value();
  watchSelectedLabels.value && watchSelectedLabels.value();
  watchSubClassToggle.value && watchSubClassToggle.value();
});

const searchParamsContainer = ref<HTMLDivElement>();
const { top: searchParamsOffsetTop } = useElementBounding(
  searchParamsContainer,
);
const scrolledToStickyPosition = computed<boolean>(() => {
  return searchParamsOffsetTop.value === 15;
});
</script>

<template>
  <div ref="searchParamsContainer">
    <div
      class="btn-group btn-group-sm d-flex mb-2"
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
      <label class="btn btn-outline-secondary w-50" for="recording-mode-cameras"
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
      <label class="btn btn-outline-secondary w-50" for="recording-mode-audio"
        >Bird Monitors</label
      >
    </div>
    <div
      class="btn-group d-flex"
      :class="{ 'btn-group-sm': scrolledToStickyPosition }"
      role="group"
      aria-label="Toggle between results groups as visits or as recordings"
      v-if="recordingMode === ActivitySearchRecordingMode.Cameras"
    >
      <input
        type="radio"
        class="btn-check"
        name="display-mode"
        id="display-mode-visits"
        autocomplete="off"
        v-model="computedDisplayMode"
        :value="'visits'"
      />
      <label class="btn btn-outline-secondary w-50" for="display-mode-visits"
        >Visits</label
      >
      <input
        type="radio"
        class="btn-check"
        name="display-mode"
        id="display-mode-recordings"
        autocomplete="off"
        v-model="computedDisplayMode"
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
      value-prop="label"
      label="label"
      :object="true"
      :searchable="false"
      :can-clear="false"
      :can-deselect="false"
      class="ms-bootstrap"
      @change="maybeSelectDatePicker"
    />
    <!--  TODO: Should this be using min/maxDateForSelectedLocations?    -->
    <datepicker
      v-if="selectedDateRange.value === 'custom'"
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
  <div class="mt-3" v-if="displayMode === ActivitySearchDisplayMode.Recordings">
    <!--    <label class="fs-7">Filtering</label>-->
    <div class="d-flex justify-content-between">
      <b-form-checkbox
        v-model="showFilteredFalsePositivesAndNones"
        switch
        :disabled="showUntaggedOnly"
        >Include
        <span v-if="recordingMode === ActivitySearchRecordingMode.Cameras"
          >false triggers</span
        ><span v-if="recordingMode === ActivitySearchRecordingMode.Audio"
          >redacted audio</span
        ></b-form-checkbox
      >
      <span class="help-toggle" ref="falsePositiveInfoParent"
        ><font-awesome-icon icon="question"
      /></span>
    </div>
    <b-popover
      click
      variant="secondary"
      v-model="toggleFalsePositiveFilterHelp"
      tooltip
      custom-class="tag-info-popover"
      placement="right-start"
      teleport-to="body"
      :target="falsePositiveInfoParent"
    >
      <span v-if="recordingMode === ActivitySearchRecordingMode.Cameras"
        >Include recordings that are only tagged as false trigger, or which have
        no tracks to tag.</span
      >
      <span v-if="recordingMode === ActivitySearchRecordingMode.Audio"
        >Include recordings that were redacted, or which have no tracks to
        tag.</span
      >
    </b-popover>
  </div>
  <button
    type="button"
    v-if="params.displayMode === ActivitySearchDisplayMode.Recordings"
    class="btn mt-2 fs-7 px-0 advanced-filtering-btn d-flex align-items-center w-100"
    @click="showAdvanced = !showAdvanced"
  >
    Advanced search
    <font-awesome-icon
      icon="chevron-right"
      :rotation="!showAdvanced ? 90 : 270"
      size="sm"
      class="ms-2"
    />
  </button>

  <div
    class="advanced-search"
    v-if="
      showAdvanced &&
      params.displayMode === ActivitySearchDisplayMode.Recordings
    "
  >
    <div class="mt-2">
      <b-form-checkbox v-model="showUntaggedOnly" switch
        >Untagged recordings only</b-form-checkbox
      >
      <div class="mt-2">
        <hierarchical-tag-select
          :disabled="showUntaggedOnly"
          class="flex-grow-1"
          ref="tagSelect"
          :open-on-mount="false"
          v-model="selectedTags"
          multiselect
        />
      </div>
      <div class="mt-2">
        <div class="d-flex justify-content-between">
          <b-form-checkbox
            switch
            v-model="includeSubSpeciesTags"
            :disabled="selectedTags.length === 0 || showUntaggedOnly"
            >Include sub-species tags
          </b-form-checkbox>
          <span ref="tagInfoParent" class="help-toggle"
            ><font-awesome-icon icon="question"
          /></span>
        </div>
        <b-popover
          click
          teleport-to="body"
          variant="secondary"
          v-model="toggleSubspeciesHelp"
          tooltip
          custom-class="tag-info-popover"
          placement="right-start"
          :target="tagInfoParent"
        >
          If you select the tag 'mammal', having this option selected means
          we'll search for all tags with 'mammal' as an ancestor. Having the
          option disabled means we'll only search for recordings with the
          explicit 'mammal' tag.
        </b-popover>
      </div>
    </div>
    <div class="mt-2">
      <div class="d-flex justify-content-between">
        <b-button
          @click.prevent="starredLabel = !starredLabel"
          variant="light"
          size="sm"
        >
          <font-awesome-icon
            :icon="starredLabel ? ['fas', 'star'] : ['far', 'star']"
            :color="starredLabel ? 'goldenrod' : '#666'"
          />
          <span class="ms-2">Starred</span>
        </b-button>
        <b-button
          @click.prevent="flaggedLabel = !flaggedLabel"
          variant="light"
          size="sm"
        >
          <font-awesome-icon
            :icon="flaggedLabel ? ['fas', 'flag'] : ['far', 'flag']"
            :color="flaggedLabel ? '#ad0707' : '#666'"
          />
          <span class="ms-2">Flagged</span>
        </b-button>
      </div>
      <label class="fs-7">Labelled with</label>
      <multiselect
        v-model="selectedLabels"
        :options="availableLabels"
        mode="tags"
        :can-clear="false"
        class="ms-bootstrap"
        searchable
      />
    </div>
  </div>
  <!--  <b-button-->
  <!--    variant="secondary"-->
  <!--    class="w-100 mt-3"-->
  <!--    :size="scrolledToStickyPosition ? 'sm' : 'md'"-->
  <!--    :disabled="!searchIsValid || searching"-->
  <!--    @click="emit('search-requested')"-->
  <!--  >-->
  <!--    <b-spinner v-if="searching" small />-->
  <!--    Search-->
  <!--  </b-button>-->
  <b-button
    variant="link"
    :size="scrolledToStickyPosition ? 'sm' : 'md'"
    class="w-100 mt-2 grey-link"
    :disabled="!searchIsValid"
    @click="emit('export-requested')"
  >
    Export search results
  </b-button>
</template>

<style lang="less" scoped>
.advanced-filtering-btn,
.advanced-filtering-btn:hover {
  color: #007086;
}
.grey-link {
  color: #666;
}
.help-toggle {
  background: var(--bs-light-bg-subtle);
  color: var(--bs-secondary);
  border: 1px solid var(--bs-secondary-bg);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
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

.tag-info-popover {
  z-index: 200001;
}
.form-check-input:checked {
  background-color: var(--bs-secondary);
  border-color: var(--bs-secondary);
}
</style>
<style lang="css">
@import url("@vueform/multiselect/themes/default.css");
</style>
<style lang="css">
@import url("@vuepic/vue-datepicker/dist/main.css");
</style>
